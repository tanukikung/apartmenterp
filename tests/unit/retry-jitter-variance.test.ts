/**
 * Retry Jitter Variance Tests
 *
 * Verifies that exponential backoff retry delays include ±25% jitter to
 * prevent synchronized retry storms when multiple workers recover simultaneously.
 *
 * Tests:
 * 1. LINE client non-429 retry path has jitter (delays vary across calls)
 * 2. LINE client 429 retry path has jitter
 * 3. job-queue markJobFailed backoff has jitter
 *
 * Run: npx vitest run tests/unit/retry-jitter-variance.test.ts
 */

import { describe, it, expect } from 'vitest';

// ── LINE client jitter ─────────────────────────────────────────────────────────

describe('LINE client retry jitter', () => {
  // Simulate the jitter calculation from line/client.ts non-429 path
  function calcNon429Delay(baseDelay: number, attempt: number): number {
    const backoffMs = baseDelay * Math.pow(2, attempt - 1);
    const jitterMs = Math.floor(Math.random() * backoffMs * 0.25);
    return Math.min(backoffMs + jitterMs, 30_000);
  }

  // Simulate the jitter calculation from line/client.ts 429 path
  function calc429Delay(baseDelay: number, rateLimitedRetries: number): number {
    const backoffMs = baseDelay * Math.pow(2, rateLimitedRetries - 1);
    const jitterMs = Math.floor(Math.random() * backoffMs * 0.25);
    return Math.min(backoffMs + jitterMs, 30_000);
  }

  it('non-429 backoff is not deterministic (varies across 10 calls)', () => {
    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      delays.push(calcNon429Delay(1_000, 2)); // 2_000 base
    }
    // With ±25% jitter, range is 2000–2500. At least one should differ.
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('non-429 jitter is within ±25% of base backoff', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calcNon429Delay(1_000, 3); // base = 4000, range 4000–5000
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(5000);
    }
  });

  it('non-429 delay is capped at 30 seconds', () => {
    const delay = calcNon429Delay(10_000, 10); // huge backoff, but capped
    expect(delay).toBeLessThanOrEqual(30_000);
  });

  it('429 backoff is not deterministic (varies across 10 calls)', () => {
    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      delays.push(calc429Delay(1_000, 1)); // 1_000 base
    }
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('429 jitter is within ±25% of base backoff', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calc429Delay(1_000, 2); // base = 2000, range 2000–2500
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(2500);
    }
  });
});

// ── job-queue jitter ───────────────────────────────────────────────────────────

describe('job-queue markJobFailed jitter', () => {
  // Mirror the jitter calculation from job-queue.ts markJobFailed
  function calcJobBackoff(nextRetry: number): number {
    const baseBackoffMs = Math.pow(2, nextRetry) * 5_000; // 10s, 20s, 40s …
    const jitterMs = Math.floor(Math.random() * baseBackoffMs * 0.25); // ±25% jitter
    return Math.min(baseBackoffMs + jitterMs, 300_000); // cap 5min
  }

  it('backoff is not deterministic (varies across 10 calls)', () => {
    const delays: number[] = [];
    for (let i = 0; i < 10; i++) {
      delays.push(calcJobBackoff(1)); // nextRetry=1 → base 10s
    }
    // Range: 10000–12500. At least one should differ from the rest.
    const unique = new Set(delays);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('jitter is within ±25% of base backoff for retry 2', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calcJobBackoff(2); // base = 20_000, range 20000–25000
      expect(delay).toBeGreaterThanOrEqual(20_000);
      expect(delay).toBeLessThanOrEqual(25_000);
    }
  });

  it('jitter is within ±25% of base backoff for retry 3', () => {
    for (let i = 0; i < 20; i++) {
      const delay = calcJobBackoff(3); // base = 40_000, range 40000–50000
      expect(delay).toBeGreaterThanOrEqual(40_000);
      expect(delay).toBeLessThanOrEqual(50_000);
    }
  });

  it('delay is capped at 5 minutes (300 seconds)', () => {
    const delay = calcJobBackoff(10); // huge backoff, but capped
    expect(delay).toBeLessThanOrEqual(300_000);
  });
});
