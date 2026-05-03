import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;

// In-memory heartbeat fallback for when Redis is not configured.
// NOTE: This only works when the worker and API share a process (single-process mode).
// In multi-process deployments, Redis is required for cross-process heartbeat.
let inMemoryHeartbeat: number | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

export function getRedisClient(): RedisClientType | null {
  if (process.env.NODE_ENV === 'test') return null;
  if (!isRedisConfigured()) return null;
  if (!client) {
    try {
      client = createClient({
        url: getRedisUrl(),
        socket: {
          connectTimeout: 1000, // fail fast if Redis not available
          reconnectStrategy(retries) {
            if (retries > 3) {
              return new Error('Redis retry attempts exhausted');
            }
            return Math.min(retries * 200, 1000);
          },
        },
      });
      client.on('error', (err) => {
        console.error('Redis error', err);
      });
    } catch {
      client = null;
    }
  }
  return client;
}

export async function ensureRedisConnected(): Promise<RedisClientType | null> {
  const c = getRedisClient();
  if (!c) return null;
  if (!c.isOpen) {
    try {
      await c.connect();
    } catch {
      // Redis not available — degrade gracefully
      return null;
    }
  }
  if (!c.isReady) return null;
  return c;
}

// All Redis keys are namespaced under "apt:" to prevent collisions with
// other services sharing the same Redis instance.
export const REDIS_NS = 'apt';

export async function redisRateLimit(key: string, max: number, windowSeconds: number): Promise<number> {
  const c = await ensureRedisConnected();
  if (!c) return 0;
  const nowKey = `${REDIS_NS}:rl:${key}`;
  const count = await c.incr(nowKey);
  if (count === 1) {
    await c.expire(nowKey, windowSeconds);
  }
  return count;
}

export async function redisPing(): Promise<boolean> {
  const c = await ensureRedisConnected();
  if (!c) return false;
  try {
    const res = await c.ping();
    return res === 'PONG';
  } catch {
    return false;
  }
}

export async function setWorkerHeartbeat(ttlSeconds: number = 30): Promise<void> {
  const c = await ensureRedisConnected();
  if (!c) {
    // In-memory fallback when Redis is not configured
    inMemoryHeartbeat = Date.now();
    return;
  }
  try {
    await c.set(`${REDIS_NS}:worker:heartbeat`, Date.now().toString(), { EX: ttlSeconds });
  } catch {
    // ignore
  }
}

export async function getWorkerHeartbeat(): Promise<number | null> {
  const c = await ensureRedisConnected();
  if (!c) {
    // In-memory fallback when Redis is not configured
    return inMemoryHeartbeat;
  }
  try {
    const val = await c.get(`${REDIS_NS}:worker:heartbeat`);
    if (!val) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

// ── LINE API rate limiter (sliding window, sorted-set) ────────────────────────
// LINE Standard Plan allows ~1000 push messages/min. This limiter prevents the
// outbox from bursting past that limit, which would cause 429 errors and retries.
// Key: apt:line:rpm  — shared across all outbox workers in multi-instance deploy.
// Falls back to "always allowed" when Redis is not configured (dev/test safety).

const LINE_RPM_KEY = `${REDIS_NS}:line:rpm`;
const LINE_RPM_DEFAULT = 950; // conservative: 5% below 1000 hard limit

export async function checkLineAPIRateLimit(
  maxPerMinute: number = LINE_RPM_DEFAULT,
): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
  const c = await ensureRedisConnected();
  if (!c) return { allowed: true, remaining: maxPerMinute, retryAfterMs: 0 };

  try {
    const now = Date.now();
    const windowStart = now - 60_000;

    // Clean entries outside the 1-minute window, then check current count
    await c.zRemRangeByScore(LINE_RPM_KEY, '-inf', windowStart.toString());
    const currentCount = await c.zCard(LINE_RPM_KEY);

    if (currentCount >= maxPerMinute) {
      // Oldest entry tells us when a slot will free up
      const oldest = await c.zRangeWithScores(LINE_RPM_KEY, 0, 0);
      const oldestScore = oldest[0]?.score ?? windowStart;
      const retryAfterMs = Math.max(1_000, oldestScore + 60_000 - now + 50);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    // Claim one slot with a unique member so concurrent workers don't collide
    await c.zAdd(LINE_RPM_KEY, {
      score: now,
      value: `${now}:${Math.random().toString(36).slice(2, 9)}`,
    });
    await c.expire(LINE_RPM_KEY, 61);

    return { allowed: true, remaining: maxPerMinute - currentCount - 1, retryAfterMs: 0 };
  } catch {
    // Redis error — fail open so messages aren't silently dropped
    return { allowed: true, remaining: maxPerMinute, retryAfterMs: 0 };
  }
}
