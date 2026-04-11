import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxProcessor } from '@/lib/outbox/processor';
import { getEventBus } from '@/lib/events';

describe('Outbox worker env/config and behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.OUTBOX_BATCH_SIZE;
    delete process.env.OUTBOX_MAX_RETRIES;
    delete process.env.OUTBOX_POLL_INTERVAL_MS;
    delete process.env.OUTBOX_DEAD_LETTER_THRESHOLD;
  });

  it('reads defaults from env when options not provided', () => {
    process.env.OUTBOX_BATCH_SIZE = '7';
    process.env.OUTBOX_MAX_RETRIES = '9';
    process.env.OUTBOX_POLL_INTERVAL_MS = '3210';
    process.env.OUTBOX_DEAD_LETTER_THRESHOLD = '4';
    const p = new OutboxProcessor(undefined, undefined as any, undefined);
    const st = p.getStatus();
    expect(st.options.batchSize).toBe(7);
    expect(st.options.maxRetries).toBe(9);
    expect(st.options.pollInterval).toBe(3210);
    expect(st.options.deadLetterThreshold).toBe(4);
  });

  it('respects batchSize in findMany take and continues on failures', async () => {
    const events: any[] = [
      { id: 'e1', aggregateType: 'T', aggregateId: '1', eventType: 'EV', payload: {}, processedAt: null, retryCount: 0, createdAt: new Date(), lastError: null },
      { id: 'e2', aggregateType: 'T', aggregateId: '2', eventType: 'EV', payload: {}, processedAt: null, retryCount: 0, createdAt: new Date(), lastError: null },
      { id: 'e3', aggregateType: 'T', aggregateId: '3', eventType: 'EV', payload: {}, processedAt: null, retryCount: 0, createdAt: new Date(), lastError: null },
    ];

    // Build a fully self-contained prisma mock
    const mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          $queryRaw: vi.fn(async () => [{ id: 'e1' }, { id: 'e2' }]),
          outboxEvent: {
            findMany: vi.fn(async (args: any) => events.slice(0, args.take)),
            update: vi.fn(async ({ where, data }: any) => {
              const e = events.find((ev) => ev.id === where.id);
              return { ...e, ...data };
            }),
          },
        };
        return fn(tx);
      }),
    } as any;

    const bus = getEventBus();
    vi.spyOn(bus, 'publish' as any)
      .mockRejectedValueOnce(new Error('boom'))   // first fails
      .mockResolvedValueOnce({})                  // second ok
      .mockResolvedValueOnce({});                // third ok (not in batch)

    const proc = new OutboxProcessor(bus as any, mockPrisma, { batchSize: 2, maxRetries: 3, pollInterval: 9999, enabled: false });
    const res = await proc.process();

    expect(res.processed + res.failed).toBeGreaterThan(0);
    expect(res.failed).toBe(1);
  });

  it('dead-letters when retry exceeds threshold', async () => {
    const events: any[] = [
      { id: 'e1', aggregateType: 'T', aggregateId: '1', eventType: 'EV', payload: {}, processedAt: null, retryCount: 4, createdAt: new Date(Date.now() - 60_000), lastError: null },
    ];

    let lastUpdateData: any = null;

    const mockPrisma = {
      $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          $queryRaw: vi.fn(async () => [{ id: 'e1' }]),
          outboxEvent: {
            findMany: vi.fn().mockResolvedValue(events),
            update: vi.fn(async ({ where, data }: any) => {
              lastUpdateData = data;
              const e = events[0];
              return { ...e, ...data };
            }),
          },
        };
        return fn(tx);
      }),
    } as any;

    const bus = getEventBus();
    // Replace bus.publish with a mock:
    // - First call: rejects (simulating event handler failure)
    // - Second call (OUTBOX_EVENT_FAILED): succeeds (dead letter alert)
    const originalPublish = (bus as any).publish;
    let callCount = 0;
    const mockPublish = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('always fail'));
      }
      // Second call is the OUTBOX_EVENT_FAILED event - it should succeed
      return Promise.resolve();
    });
    (bus as any).publish = mockPublish;

    const proc = new OutboxProcessor(bus as any, mockPrisma, { maxRetries: 5, deadLetterThreshold: 4, batchSize: 10, pollInterval: 9999, enabled: false });
    const res = await proc.process();

    expect(res.failed).toBe(1);
    expect(lastUpdateData.lastError).toMatch(/DEAD_LETTER/);
    expect(lastUpdateData.processedAt).toBeInstanceOf(Date);

    // Restore original publish
    (bus as any).publish = originalPublish;
  });
});