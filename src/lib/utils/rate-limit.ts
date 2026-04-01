// ============================================================================
// In-memory rate limiter with Redis backend when available.
// Redis provides atomic INCR+EXPIRE so works correctly in multi-instance.
// In-memory fallback for single-instance or when Redis is unavailable.
// ============================================================================

import { redisRateLimit, isRedisConfigured } from '@/infrastructure/redis';

interface BucketEntry {
  count: number;
  resetAt: number; // epoch ms
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export class RateLimiter {
  private store = new Map<string, BucketEntry>();

  /** Clear all entries - useful for testing */
  reset(): void {
    this.store.clear();
  }

  /**
   * Check whether the key is within the allowed rate.
   * Uses Redis INCR+EXPIRE when available (atomic, multi-instance safe).
   * Falls back to in-memory Map when Redis is unavailable.
   * @param key        Unique identifier (e.g. "login:1.2.3.4")
   * @param limit      Maximum calls allowed in the window
   * @param windowMs   Window length in milliseconds
   */
  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    // Try Redis first — atomic and multi-instance safe
    if (isRedisConfigured()) {
      const windowSeconds = Math.ceil(windowMs / 1000);
      const count = await redisRateLimit(key, limit, windowSeconds);
      if (count > 0) {
        const ttl = await this.getRedisTtl(key, windowSeconds);
        const resetAt = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : windowMs));
        if (count > limit) {
          return { allowed: false, remaining: 0, resetAt };
        }
        return { allowed: true, remaining: Math.max(0, limit - count), resetAt };
      }
      // Redis returned 0 — fall through to in-memory (Redis unavailable at runtime)
    }

    // In-memory fallback
    return this.checkMemory(key, limit, windowMs);
  }

  private async getRedisTtl(key: string, windowSeconds: number): Promise<number> {
    try {
      const { getRedisClient } = await import('@/infrastructure/redis');
      const c = getRedisClient();
      if (!c || !c.isOpen) return windowSeconds;
      const ttl = await c.ttl(`ratelimit:${key}`);
      return ttl > 0 ? ttl : windowSeconds;
    } catch {
      return windowSeconds;
    }
  }

  private checkMemory(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    // Aggressive cleanup: sweep on every call to prevent unbounded memory growth
    this.cleanup(now);

    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      const resetAt = now + windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetAt: new Date(resetAt) };
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: new Date(entry.resetAt) };
    }

    entry.count++;
    return { allowed: true, remaining: Math.max(0, limit - entry.count), resetAt: new Date(entry.resetAt) };
  }

  private cleanup(now: number): void {
    this.store.forEach((entry, key) => {
      if (now >= entry.resetAt) this.store.delete(key);
    });
  }
}

// ============================================================================
// Singleton factories
// ============================================================================

let loginLimiter: RateLimiter | null = null;
let apiLimiter: RateLimiter | null = null;
let forgotPasswordLimiter: RateLimiter | null = null;

/** 5 attempts per 15 minutes per IP (or 1 minute in TEST_MODE) */
export function getLoginRateLimiter(): RateLimiter {
  if (!loginLimiter) {
    loginLimiter = new RateLimiter();
  }
  return loginLimiter;
}

/** 100 requests per minute per IP */
export function getApiRateLimiter(): RateLimiter {
  if (!apiLimiter) {
    apiLimiter = new RateLimiter();
  }
  return apiLimiter;
}

/** 3 attempts per hour per IP */
export function getForgotPasswordRateLimiter(): RateLimiter {
  if (!forgotPasswordLimiter) {
    forgotPasswordLimiter = new RateLimiter();
  }
  return forgotPasswordLimiter;
}
