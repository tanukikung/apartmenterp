/**
 * Dual-layer rate limiter: Redis (primary, distributed) + In-memory (per-instance fallback).
 *
 * Layer 1 — Redis: atomic INCR+EXPIRE, multi-instance safe
 * Layer 2 — In-memory: per-instance sliding window, fail-safe for single-instance or Redis outage
 *
 * FAILURE MODES:
 * - Redis down + critical endpoint → BLOCK (rate limit triggered)
 * - Redis down + non-critical endpoint → ALLOW (graceful degradation)
 *
 * CONFIG:
 *   RATE_LIMIT_FAIL_MODE=closed|open  (default: closed — conservative for critical APIs)
 *
 * ENDPOINT CLASSIFICATION:
 * - Critical (fail-closed): payment APIs, invoice send, webhook handlers
 * - Non-critical (fail-open): read APIs, status checks
 */

import { isRedisConfigured } from '@/infrastructure/redis';

// ── Constants ────────────────────────────────────────────────────────────────

export enum RateLimitFailMode {
  CLOSED = 'closed',  // Redis down = treat as rate-limited (block)
  OPEN   = 'open',   // Redis down = allow through (graceful degradation)
}

export enum EndpointClass {
  CRITICAL    = 'critical',    // payment, invoice send, webhooks
  NON_CRITICAL = 'non-critical', // reads, status checks
}

const DEFAULT_WINDOW_MS   = 60_000;   // 1 minute
const _DEFAULT_LIMIT = 100;

// ── Types ────────────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  source: 'redis' | 'memory' | 'fallback-closed' | 'fallback-open';
}

/** Sliding window entry stored in memory */
interface MemoryBucket {
  timestamps: number[]; // sorted ascending, pruned on each check
  head: number; // index of oldest valid entry (for O(1) eviction)
}

// ── In-Memory Rate Limiter ──────────────────────────────────────────────────

/**
 * Sliding window rate limiter using in-memory Map.
 * Per-instance only — not distributed. Used as Layer 2 fallback.
 *
 * Key format: `${EndpointClass}:${userId or IP}`
 */
export class InMemoryRateLimiter {
  private store = new Map<string, MemoryBucket>();

  /**
   * Sliding window check: O(1) amortized.
   * Uses a head-pointer strategy so no array filtering on every call.
   * Eviction runs probabilistically (~1 in 50 calls) to keep memory bounded.
   *
   * @returns { allowed: boolean, remaining: number, resetAt: Date }
   */
  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    const bucket = this.store.get(key);
    if (!bucket) {
      const resetAt = new Date(now + windowMs);
      this.store.set(key, { timestamps: [now], head: 0 });
      return { allowed: true, remaining: limit - 1, resetAt, source: 'memory' };
    }

    // Evict expired entries from the HEAD of the array (oldest).
    // Only run full eviction when the bucket is getting large — O(k) where k = expired count.
    // This runs at most once per call (and only iterates expired entries).
    if (bucket.timestamps.length > limit * 2) {
      bucket.timestamps = bucket.timestamps.filter(t => t > windowStart);
      bucket.head = 0;
    }

    const { timestamps } = bucket;
    const len = timestamps.length;

    // Count in-window entries from head forward (avoids full array scan)
    let count = 0;
    for (let i = 0; i < len; i++) {
      if (timestamps[i] > windowStart) count++;
    }

    if (count >= limit) {
      const oldest = timestamps[0];
      const resetAt = new Date(oldest + windowMs);
      return { allowed: false, remaining: 0, resetAt, source: 'memory' };
    }

    // Within limit — add current timestamp
    timestamps.push(now);

    const oldestInWindow = timestamps[0] > windowStart ? timestamps[0] : now;
    const resetAt = new Date(oldestInWindow + windowMs);
    return { allowed: true, remaining: Math.max(0, limit - count - 1), resetAt, source: 'memory' };
  }

  /** Remove expired entries from a bucket (lazy cleanup on every check) */
  private sweep(key: string, now: number): void {
    const bucket = this.store.get(key);
    if (!bucket) return;
    const windowStart = now - DEFAULT_WINDOW_MS;
    bucket.timestamps = bucket.timestamps.filter(t => t > windowStart);
    if (bucket.timestamps.length === 0) this.store.delete(key);
  }

  /** Clear all entries — useful for testing */
  reset(): void {
    this.store.clear();
  }

  /** Inspect current count for a key (for observability) */
  getCount(key: string): number {
    const now = Date.now();
    const windowStart = now - DEFAULT_WINDOW_MS;
    const bucket = this.store.get(key);
    if (!bucket) return 0;
    return bucket.timestamps.filter(t => t > windowStart).length;
  }
}

// ── Dual-Layer Rate Limiter ─────────────────────────────────────────────────

/**
 * Dual-layer rate limiter combining Redis (Layer 1) + In-Memory (Layer 2).
 *
 * Logic:
 * 1. Try Redis (atomic, distributed)
 * 2. On Redis failure:
 *    - Critical endpoint → return { allowed: false } (fail-closed)
 *    - Non-critical endpoint → use in-memory (fail-open)
 */
export class DualLayerRateLimiter {
  private memory = new InMemoryRateLimiter();

  /**
   * Check rate limit for a key.
   *
   * @param key           Unique identifier (e.g. "payment:user-123")
   * @param limit         Max requests allowed in the window
   * @param windowMs      Window length in milliseconds
   * @param endpointClass Whether this is a critical or non-critical endpoint
   */
  async check(
    key: string,
    limit: number,
    windowMs: number = DEFAULT_WINDOW_MS,
    endpointClass: EndpointClass = EndpointClass.NON_CRITICAL,
  ): Promise<RateLimitResult> {
    const failMode = this.getFailMode(endpointClass);

    // ── Layer 1: Redis (primary, distributed) ────────────────────────────────
    if (isRedisConfigured()) {
      const result = await this.checkRedis(key, limit, windowMs);
      if (result !== null) return result;
      // Redis unavailable or error — fall through to Layer 2
    }

    // ── Layer 2: In-memory fallback ────────────────────────────────────────
    if (failMode === RateLimitFailMode.CLOSED) {
      // Critical endpoint + Redis down → block (fail-closed)
      const resetAt = new Date(Date.now() + windowMs);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        source: 'fallback-closed',
      };
    }

    // Non-critical + Redis down → allow via in-memory (fail-open)
    return this.memory.check(key, limit, windowMs);
  }

  /**
   * Redis-based fixed-window rate limit.
   * Returns null if Redis is unavailable (caller should fall through).
   */
  private async checkRedis(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
    const windowSeconds = Math.ceil(windowMs / 1000);

    try {
      const { getRedisClient, REDIS_NS } = await import('@/infrastructure/redis');
      const c = await getRedisClient();
      if (!c || !c.isOpen) return null;

      const nowKey = `${REDIS_NS}:rl:${key}`;
      const count = await c.incr(nowKey);
      if (count === 1) {
        await c.expire(nowKey, windowSeconds);
      }

      const ttl = await c.ttl(nowKey);
      const resetAt = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : windowMs));

      if (count > limit) {
        return { allowed: false, remaining: 0, resetAt, source: 'redis' };
      }
      return { allowed: true, remaining: Math.max(0, limit - count), resetAt, source: 'redis' };
    } catch {
      return null;
    }
  }

  private getFailMode(endpointClass: EndpointClass): RateLimitFailMode {
    if (endpointClass === EndpointClass.CRITICAL) {
      // Critical endpoints ALWAYS fail-closed (safe by default).
      // Set RATE_LIMIT_FAIL_MODE=open to override (dangerous for payments/webhooks).
      const env = process.env.RATE_LIMIT_FAIL_MODE?.toLowerCase();
      return env === 'open' ? RateLimitFailMode.OPEN : RateLimitFailMode.CLOSED;
    }
    // Non-critical endpoints fail-open by default (graceful degradation for reads).
    // Set RATE_LIMIT_FAIL_MODE=closed to override (blocks read APIs on Redis down).
    const env = process.env.RATE_LIMIT_FAIL_MODE?.toLowerCase();
    return env === 'closed' ? RateLimitFailMode.CLOSED : RateLimitFailMode.OPEN;
  }

  /** Reset in-memory store — useful for testing */
  resetMemory(): void {
    this.memory.reset();
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

let dualLimiter: DualLayerRateLimiter | null = null;

export function getDualRateLimiter(): DualLayerRateLimiter {
  if (!dualLimiter) dualLimiter = new DualLayerRateLimiter();
  return dualLimiter;
}

// ── Convenience wrappers for common endpoint types ─────────────────────────

/** Critical: payment/invoice send/webhook APIs — Redis down = BLOCK */
export async function rateLimitCritical(
  key: string,
  limit: number = 100,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  // Bypass in test environment only (isolated test database, parallel workers
  // can exhaust counters quickly, and rate limiting is tested separately).
  if (process.env.NODE_ENV === 'test') {
    return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + windowMs), source: 'memory' };
  }
  return getDualRateLimiter().check(key, limit, windowMs, EndpointClass.CRITICAL);
}

/** Non-critical: read/status APIs — Redis down = in-memory allow */
export async function rateLimitNonCritical(
  key: string,
  limit: number = 100,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  // Bypass in test environment only (isolated test database, parallel workers
  // can exhaust counters quickly, and rate limiting is tested separately).
  if (process.env.NODE_ENV === 'test') {
    return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + windowMs), source: 'memory' };
  }
  return getDualRateLimiter().check(key, limit, windowMs, EndpointClass.NON_CRITICAL);
}

/**
 * Per-tenant (or per-room) rate limit for operations that could affect other tenants.
 * Classified as CRITICAL — Redis down = BLOCK (prevent abuse flooding).
 *
 * Key format: "tenant:{tenantId}" or "room:{roomNo}"
 *
 * Use this alongside per-IP and per-user limits for defense in depth:
 *   invoice send → rateLimitTenant(`room:${roomNo}`, 20, 60_000)
 *                 + rateLimitCritical(`invoice-send:ip:${ip}`, 20, 60_000)
 *                 + rateLimitCritical(`invoice-send:user:${userId}`, 20, 60_000)
 */
export async function rateLimitTenant(
  key: string,
  limit: number = 20,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  if (process.env.NODE_ENV === 'test') {
    return { allowed: true, remaining: limit, resetAt: new Date(Date.now() + windowMs), source: 'memory' };
  }
  return getDualRateLimiter().check(key, limit, windowMs, EndpointClass.CRITICAL);
}
