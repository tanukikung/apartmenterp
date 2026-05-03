import { createClient, type RedisClientType } from 'redis';

// All Redis keys are namespaced to prevent collision with other applications
// sharing the same Redis instance.
const KEY_PREFIX = 'apt:';

export const REDIS_KEYS = {
  rateLimit: (key: string) => `${KEY_PREFIX}ratelimit:${key}`,
  workerHeartbeat: () => `${KEY_PREFIX}worker:heartbeat`,
  billingQueue: () => `${KEY_PREFIX}billing-generation`,
} as const;

let client: RedisClientType | null = null;

// In-memory heartbeat fallback for when Redis is not configured.
// NOTE: This only works when the worker and API share a process (single-process mode).
// In multi-process deployments, Redis is required for cross-process heartbeat.
let inMemoryHeartbeat: number | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function getRedisUrl(): string {
  // Require REDIS_URL to be explicitly set — no silent fallback to localhost.
  // If not set, Redis-dependent features degrade gracefully (in-memory fallback).
  return process.env.REDIS_URL ?? '';
}

export function getRedisClient(): RedisClientType | null {
  if (process.env.NODE_ENV === 'test') return null;
  const url = getRedisUrl();
  if (!url) return null;
  if (!client) {
    try {
      client = createClient({
        url,
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
        console.error('[Redis] client error:', err.message);
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

export async function redisRateLimit(key: string, max: number, windowSeconds: number): Promise<number> {
  const c = await ensureRedisConnected();
  if (!c) return 0;
  const nowKey = REDIS_KEYS.rateLimit(key);
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
    await c.set(REDIS_KEYS.workerHeartbeat(), Date.now().toString(), { EX: ttlSeconds });
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
    const val = await c.get(REDIS_KEYS.workerHeartbeat());
    if (!val) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
