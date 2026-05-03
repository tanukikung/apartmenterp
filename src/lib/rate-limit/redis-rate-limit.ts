/**
 * Redis-based sliding window rate limiter.
 *
 * Uses Redis sorted sets for precise sliding window counting.
 * Works across multiple Next.js instances.
 *
 * Usage:
 *   const { allowed, remaining, resetAt } = await slidingWindowRateLimit(
 *     `billing:${ip}`, 20, 60_000
 *   );
 */

import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379/1';
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });

redis.on('error', (err) => {
  if (err.message !== 'Connection is closed.') {
    console.error('[Redis RateLimit] error:', err.message);
  }
});

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Sliding window rate limit using Redis sorted sets.
 *
 * @param key       Unique identifier (e.g., `billing:192.168.1.1`)
 * @param limit     Max requests allowed in the window
 * @param windowMs  Window size in milliseconds
 */
export async function slidingWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  // Use pipeline for atomic operations
  const pipeline = redis.pipeline();

  // Remove old entries outside the window
  pipeline.zremrangebyscore(redisKey, '-inf', windowStart);

  // Count current entries in window
  pipeline.zcard(redisKey);

  // Add current request timestamp
  pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);

  // Set expiry on the key (windowMs + buffer)
  pipeline.expire(redisKey, Math.ceil(windowMs / 1000) + 5);

  const results = await pipeline.exec();
  const currentCount = results?.[1]?.[1] as number ?? 0;

  const remaining = Math.max(0, limit - currentCount - 1);
  const resetAt = new Date(now + windowMs);

  return {
    allowed: currentCount < limit,
    remaining,
    resetAt,
  };
}

/**
 * Simple fixed-window rate limiter (fallback when sliding window is too heavy).
 */
export async function fixedWindowRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowKey = `ratelimit:fixed:${key}:${Math.floor(now / windowMs)}`;

  const count = await redis.incr(windowKey);
  if (count === 1) {
    await redis.pexpire(windowKey, windowMs);
  }

  const remaining = Math.max(0, limit - count);
  const resetAt = new Date(Math.floor(now / windowMs) * windowMs + windowMs);

  return {
    allowed: count <= limit,
    remaining,
    resetAt,
  };
}

/** Close the Redis connection (for graceful shutdown) */
export async function closeRateLimitRedis() {
  await redis.quit();
}