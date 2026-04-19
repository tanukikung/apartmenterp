import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();

process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Outbox worker', () => {
  // TODO: times out at 30s. Same suspected cause as other real-DB
  // integration tests — Prisma mock leakage despite vi.doUnmock.
  it.skip('processes an outbox event and marks it processed', async () => {
    const [{ prisma }, { createOutboxProcessor }] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/outbox/processor'),
    ]);
    try {
      await prisma.$connect();
    } catch {
      return;
    }

    const event = await prisma.outboxEvent.create({
      data: {
        id: crypto.randomUUID(),
        aggregateType: 'Test',
        aggregateId: 'agg-1',
        eventType: 'TEST_EVENT',
        payload: { foo: 'bar' } as any,
        retryCount: 0,
      },
    });

    const processor = createOutboxProcessor({ enabled: true, batchSize: 10 });
    const res = await processor.process();
    expect(res.processed + res.failed).toBeGreaterThan(0);

    const updated = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
    expect(updated?.processedAt).not.toBeNull();
  });
});
