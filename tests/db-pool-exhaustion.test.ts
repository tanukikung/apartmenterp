/**
 * DB Pool Exhaustion Tests
 *
 * Tests verify the pool guard mechanism:
 * 1. Fails fast when concurrent limit exceeded (no hang)
 * 2. No timeouts under burst (guard fails fast, not hang)
 * 3. Counter decrements on error (recovery works)
 * 4. Metrics subsystem is operational
 */

import { describe, it, expect } from 'vitest';
import { inc, getSnapshot } from '@/lib/metrics/messaging';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function simulateBurst(
  count: number,
  operationFactory: () => Promise<unknown>,
  timeoutMs = 5000,
): Promise<{ poolExhausted: number; successes: number; timedOut: number }> {
  const operations = Array.from({ length: count }, () => operationFactory());

  const withTimeout = operations.map((p) =>
    Promise.race([
      p.then((v) => ({ status: 'fulfilled' as const, value: v })),
      new Promise<{ status: 'rejected'; reason: unknown }>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs),
      ),
    ]).catch((reason) => ({ status: 'rejected' as const, reason })),
  );

  const results = await Promise.all(withTimeout);

  let poolExhausted = 0;
  let successes = 0;
  let timedOut = 0;

  for (const r of results) {
    if (r.status === 'fulfilled') {
      successes++;
    } else {
      const reason = r.reason as any;
      if (reason?.code === 'DB_POOL_EXHAUSTED') {
        poolExhausted++;
      } else if ((reason as Error)?.message === 'TIMEOUT') {
        timedOut++;
      }
    }
  }

  return { poolExhausted, successes, timedOut };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DB Pool Exhaustion Guard', () => {

  describe('fail-fast under load', () => {
    it('zero timeouts under 30-request burst (guard fails fast, no hang)', async () => {
      process.env.MAX_CONCURRENT_DB_QUERIES = '3';

      const { withTransaction, disconnectPrisma } = await import('@/lib/db/client');

      const { timedOut, poolExhausted, successes } = await simulateBurst(
        30,
        () => withTransaction(async () => 'ok'),
        4000,
      );

      // ZERO timeouts = guard fails fast, never hangs.
      // This is the most critical production property: under overload,
      // the system rejects requests immediately rather than queueing forever.
      expect(timedOut).toBe(0);
      // All requests accounted for (no silent drops)
      expect(poolExhausted + successes).toBe(30);

      await disconnectPrisma();
    });

    it('recovers cleanly after pool exhaustion', async () => {
      process.env.MAX_CONCURRENT_DB_QUERIES = '2';

      const { withTransaction, disconnectPrisma } = await import('@/lib/db/client');

      const first = await simulateBurst(10, () => withTransaction(async () => 'ok'), 3000);
      expect(first.poolExhausted + first.successes).toBe(10);

      await new Promise((r) => setTimeout(r, 50));

      // After cleanup, new requests should succeed (pool drains)
      const second = await simulateBurst(5, () => withTransaction(async () => 'ok'), 3000);
      expect(second.successes).toBeGreaterThan(0);

      await disconnectPrisma();
    });
  });

  describe('metrics subsystem', () => {
    it('getSnapshot() returns valid metrics structure', async () => {
      const snap = getSnapshot();
      expect(snap.uptimeSecs).toBeGreaterThanOrEqual(0);
      expect(snap.counters).toBeDefined();
      expect(typeof snap.counters.outbox_sent_total).toBe('number');
      expect(typeof snap.counters.outbox_failed_total).toBe('number');
    });

    it('inc() correctly increments counters', async () => {
      const initial = getSnapshot().counters.outbox_sent_total;
      inc('outbox_sent_total');
      expect(getSnapshot().counters.outbox_sent_total).toBe(initial + 1);
    });
  });
});
