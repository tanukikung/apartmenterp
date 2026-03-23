import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

export function getRedisClient(): RedisClientType | null {
  if (process.env.NODE_ENV === 'test') return null;
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

export async function redisRateLimit(key: string, max: number, windowSeconds: number): Promise<number> {
  const c = await ensureRedisConnected();
  if (!c) return 0;
  const nowKey = `ratelimit:${key}`;
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
  if (!c) return;
  try {
    await c.set('worker:heartbeat', Date.now().toString(), { EX: ttlSeconds });
  } catch {
    // ignore
  }
}

export async function getWorkerHeartbeat(): Promise<number | null> {
  const c = await ensureRedisConnected();
  if (!c) return null;
  try {
    const val = await c.get('worker:heartbeat');
    if (!val) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
