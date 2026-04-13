import { createClient, type RedisClientType } from 'redis';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

let client: RedisClientType | null = null;
const HEARTBEAT_FILE = join(process.cwd(), '.runtime', 'worker-heartbeat.txt');

// In-memory heartbeat fallback for when Redis is not configured.
// NOTE: This only works when the worker and API share a process (single-process mode).
// In multi-process deployments, Redis is required for cross-process heartbeat.
let inMemoryHeartbeat: number | null = null;

async function writeHeartbeatFallback(value: number): Promise<void> {
  try {
    await mkdir(dirname(HEARTBEAT_FILE), { recursive: true });
    await writeFile(HEARTBEAT_FILE, value.toString(), 'utf8');
  } catch {
    // Best effort only.
  }
}

async function readHeartbeatFallback(): Promise<number | null> {
  try {
    const raw = await readFile(HEARTBEAT_FILE, 'utf8');
    const value = Number(raw.trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

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
  if (!c) {
    // Cross-process fallback when Redis is unavailable.
    inMemoryHeartbeat = Date.now();
    await writeHeartbeatFallback(inMemoryHeartbeat);
    return;
  }
  try {
    const now = Date.now();
    await c.set('worker:heartbeat', now.toString(), { EX: ttlSeconds });
    inMemoryHeartbeat = now;
    await writeHeartbeatFallback(now);
  } catch {
    inMemoryHeartbeat = Date.now();
    await writeHeartbeatFallback(inMemoryHeartbeat);
  }
}

export async function getWorkerHeartbeat(): Promise<number | null> {
  const c = await ensureRedisConnected();
  if (!c) {
    const fileHeartbeat = await readHeartbeatFallback();
    return fileHeartbeat ?? inMemoryHeartbeat;
  }
  try {
    const val = await c.get('worker:heartbeat');
    const redisHeartbeat = val ? Number(val) : null;
    if (redisHeartbeat != null && Number.isFinite(redisHeartbeat)) {
      return redisHeartbeat;
    }
    return (await readHeartbeatFallback()) ?? inMemoryHeartbeat;
  } catch {
    return (await readHeartbeatFallback()) ?? inMemoryHeartbeat;
  }
}
