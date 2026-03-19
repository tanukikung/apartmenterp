// ============================================================================
// In-memory rate limiter
// Falls back gracefully when Redis is not available.
// ============================================================================

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
  private callCount = 0;

  /**
   * Check whether the key is within the allowed rate.
   * @param key        Unique identifier (e.g. "login:1.2.3.4")
   * @param limit      Maximum calls allowed in the window
   * @param windowMs   Window length in milliseconds
   */
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();

    // Every 100th call, sweep stale entries to prevent unbounded memory growth.
    this.callCount++;
    if (this.callCount % 100 === 0) {
      this.cleanup(now);
    }

    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      // New window
      const resetAt = now + windowMs;
      this.store.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt: new Date(resetAt),
      };
    }

    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: limit - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  }

  private cleanup(now: number): void {
    this.store.forEach((entry, key) => {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    });
  }
}

// ============================================================================
// Singleton factories
// ============================================================================

let loginLimiter: RateLimiter | null = null;
let apiLimiter: RateLimiter | null = null;
let forgotPasswordLimiter: RateLimiter | null = null;

/** 5 attempts per 15 minutes per IP */
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
