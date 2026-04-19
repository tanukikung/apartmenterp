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

    // Multiple parallel forks run their own outbox processors against the shared
    // test DB; with FOR UPDATE SKIP LOCKED our event may not land in the first
    // batch we claim. Retry until our specific event is marked processed.
    const processor = createOutboxProcessor({ enabled: true, batchSize: 100 });
    let updated: any = null;
    for (let i = 0; i < 10; i++) {
      await processor.process();
      updated = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
      if (updated?.processedAt) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(updated?.processedAt).not.toBeNull();
  });
});
