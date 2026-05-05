/**
 * Dual-Layer Rate Limiter Tests
 *
 * Tests the FAIL-CLOSED / FAIL-OPEN behavior.
 *
 * Key insight: When REDIS_URL is set in .env (which gets loaded in tests),
 * isRedisConfigured() returns true. But Redis isn't running → checkRedis
 * throws → returns null → falls to Layer 2 (in-memory).
 * This means:
 *   - CRITICAL endpoints → BLOCK (fail-closed, as designed)
 *   - NON_CRITICAL endpoints → in-memory allows (fail-open, as designed)
 *
 * We test the actual behavior as it runs in the test environment.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryRateLimiter,
  EndpointClass,
  type RateLimitResult,
} from '@/lib/rate-limit/dual-layer-rate-limiter';

// ── In-memory sliding window (fully testable in isolation) ─────────────────

describe('InMemoryRateLimiter: sliding window behavior', () => {

  let limiter: InMemoryRateLimiter;

  beforeEach(() => {
    limiter = new InMemoryRateLimiter();
  });

  it('first request → allowed, remaining = limit-1', () => {
    const result = limiter.check('key-a', 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.source).toBe('memory');
  });

  it('exactly limit requests → last one blocked', () => {
    const key = 'key-b';
    const limit = 3;

    expect(limiter.check(key, limit, 60_000).allowed).toBe(true);  // 1
    expect(limiter.check(key, limit, 60_000).allowed).toBe(true);  // 2
    expect(limiter.check(key, limit, 60_000).allowed).toBe(true);  // 3 = limit
    expect(limiter.check(key, limit, 60_000).allowed).toBe(false); // 4 > limit
  });

  it('limit=1: second request is blocked', () => {
    const uniqueKey = 'unique-key-' + Math.random();
    // First request on a fresh key with limit=1 → allowed
    const first = limiter.check(uniqueKey, 1, 60_000);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(0);
    // Second request on same key → blocked
    const second = limiter.check(uniqueKey, 1, 60_000);
    expect(second.allowed).toBe(false);
  });

  it('per-key isolation: each key has independent limit', () => {
    const limit = 2;
    limiter.check('user-1', limit, 60_000);
    limiter.check('user-1', limit, 60_000);
    expect(limiter.check('user-1', limit, 60_000).allowed).toBe(false);
    expect(limiter.check('user-2', limit, 60_000).allowed).toBe(true);
  });

  it('reset() clears all keys', () => {
    limiter.check('user-x', 2, 60_000);
    limiter.check('user-x', 2, 60_000);
    limiter.reset();
    expect(limiter.check('user-x', 2, 60_000).allowed).toBe(true);
  });

  it('100 requests with limit=100 → exactly 100 allowed', () => {
    const limiter = new InMemoryRateLimiter();
    const key = 'burst-test';
    const limit = 100;
    let allowed = 0;

    for (let i = 0; i < 1000; i++) {
      if (limiter.check(key, limit, 60_000).allowed) allowed++;
    }

    expect(allowed).toBe(100);
  });

  it('concurrent burst simulation: exactly limit allowed', () => {
    const limiter = new InMemoryRateLimiter();
    const key = 'parallel-burst';
    const limit = 50;
    let allowed = 0;

    for (let i = 0; i < 200; i++) {
      if (limiter.check(key, limit, 60_000).allowed) allowed++;
    }

    expect(allowed).toBe(50);
  });
});

// ── In-memory limiter: fail-closed logic via integration with DualLayer ─────

/**
 * The DualLayerRateLimiter's fail-closed behavior for critical endpoints
 * when Redis is unavailable is tested via the actual DualLayerRateLimiter.
 *
 * In the test environment:
 *   .env has REDIS_URL=redis://localhost:6379/1
 *   → isRedisConfigured() = TRUE
 *   → checkRedis() is called → Redis throws → returns null
 *   → Layer 2 fallback is used
 *   → CRITICAL → fail-closed BLOCKED
 *   → NON_CRITICAL → in-memory ALLOWED
 *
 * This is the CORRECT behavior we want to verify.
 */

describe('DualLayerRateLimiter: actual test-environment behavior', () => {

  it('CRITICAL endpoint → BLOCKED (fail-closed) when Redis is unavailable', async () => {
    // Import fresh to get the actual singleton behavior with .env loaded
    const { getDualRateLimiter } = await import('@/lib/rate-limit/dual-layer-rate-limiter');
    const limiter = getDualRateLimiter();
    limiter.resetMemory(); // ensure clean state

    const result = await limiter.check('critical-key', 100, 60_000, EndpointClass.CRITICAL);

    // With Redis configured but unavailable, critical → BLOCKED
    expect(result.allowed).toBe(false);
    expect(result.source).toBe('fallback-closed');
  });

  it('NON_CRITICAL endpoint → ALLOWED via in-memory (fail-open)', async () => {
    const { getDualRateLimiter } = await import('@/lib/rate-limit/dual-layer-rate-limiter');
    const limiter = getDualRateLimiter();
    limiter.resetMemory(); // ensure clean state

    const result = await limiter.check('non-critical-key', 100, 60_000, EndpointClass.NON_CRITICAL);

    // fail-open: non-critical allows via in-memory
    expect(result.allowed).toBe(true);
    expect(result.source).toBe('memory');
  });
});

// ── In-memory limit enforcement for non-critical burst ─────────────────────

describe('Non-critical burst: in-memory limit enforced', () => {
  it('1000 burst requests on SAME key → exactly 100 allowed', async () => {
    const { getDualRateLimiter } = await import('@/lib/rate-limit/dual-layer-rate-limiter');
    const limiter = getDualRateLimiter();

    let allowed = 0;
    // Use SAME key for all 1000 requests — in-memory limiter tracks per-key
    for (let i = 0; i < 1000; i++) {
      const r = await limiter.check('burst-nc-shared-key', 100, 60_000, EndpointClass.NON_CRITICAL);
      if (r.allowed) allowed++;
    }

    // In-memory: exactly 100 allowed (rest blocked)
    expect(allowed).toBe(100);
  });
});
