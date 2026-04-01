import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutboxProcessor } from '@/lib/outbox';
import { getEventBus, EventTypes } from '@/lib';
import { prisma } from '@/lib/db/client';

describe('Outbox retry/backoff', () => {
  const events: Array<{ id: string; eventType: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; createdAt: Date; processedAt: Date | null; retryCount: number; lastError: string | null }> = [];
  let p: any;

  beforeEach(() => {
    events.length = 0;
    vi.restoreAllMocks();
    // Add a failing event
    events.push({
      id: 'evt-1',
      eventType: EventTypes.INVOICE_PAID,
      aggregateType: 'Invoice',
      aggregateId: '11111111-1111-1111-1111-111111111111',
      payload: {
        invoiceId: '11111111-1111-1111-1111-111111111111',
        paymentId: '22222222-2222-2222-2222-222222222222',
        paidAt: new Date().toISOString(),
        amount: 1000,
      },
      createdAt: new Date(Date.now() - 60_000),
      processedAt: null,
      retryCount: 0,
      lastError: null,
    });

    // Mock prisma for outbox operations
    p = prisma as any;
    p.outboxEvent = p.outboxEvent || {};
    p.outboxEvent.findMany = vi.fn(async ({ where }: any) => {
      return events.filter(e => e.processedAt === null && e.retryCount < (where?.retryCount?.lt ?? 3));
    });
    p.outboxEvent.update = vi.fn(async ({ where, data }: any) => {
      const ev = events.find(e => e.id === where.id);
      if (!ev) return null;
      if (data.processedAt) {
        ev.processedAt = new Date(data.processedAt);
      }
      if (data.retryCount?.increment) {
        ev.retryCount += data.retryCount.increment;
      }
      if (typeof data.lastError === 'string') {
        ev.lastError = data.lastError;
      }
      return ev;
    });
    p.outboxEvent.count = vi.fn(async ({ where }: any) => {
      return events.filter(e => e.processedAt === null && e.retryCount >= (where?.retryCount?.gte ?? 0)).length;
    });
  });

  it('increments retryCount on failure and keeps processedAt null, then processes on retry', async () => {
    const bus = getEventBus();
    const publishSpy = vi
      .spyOn(bus, 'publish' as any)
      // First call rejects to simulate subscriber failure
      .mockRejectedValueOnce(new Error('temporary failure'))
      // Second call resolves successfully
      .mockResolvedValueOnce({
        type: EventTypes.INVOICE_PAID,
        aggregateType: 'Invoice',
        aggregateId: '11111111-1111-1111-1111-111111111111',
        payload: events[0].payload,
        metadata: { correlationId: '00000000-0000-0000-0000-000000000000', timestamp: new Date(), version: 1 },
      } as any);

    const maxRetries = 3;
    // Mock $transaction to run the callback synchronously with a tx proxy
    const mockTx = {
      $queryRaw: vi.fn(async () => {
        return events
          .filter(e => e.processedAt === null && e.retryCount < maxRetries)
          .slice(0, 10)
          .map(e => ({ id: e.id }));
      }),
      outboxEvent: {
        findMany: p.outboxEvent.findMany,
        update: p.outboxEvent.update,
        count: p.outboxEvent.count,
      },
    };
    p.$transaction = vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => {
      return callback(mockTx as any);
    }) as any;
    const processor = new OutboxProcessor(bus, p, { maxRetries, batchSize: 10, pollInterval: 9999, enabled: false });
    await processor.process();
    expect(publishSpy).toHaveBeenCalledTimes(1);
    // Ensure prisma update called to increment retry
    expect(p.outboxEvent.update).toHaveBeenCalled();
    expect(events[0].retryCount).toBe(1);
    expect(events[0].processedAt).toBeNull();
    expect(events[0].lastError).toMatch(/temporary failure/);

    // Next publish will succeed due to mockResolvedValueOnce above

    // Ensure backoff delay has elapsed (createdAt is old already)
    await processor.process();
    expect(publishSpy).toHaveBeenCalledTimes(2);
    expect(events[0].processedAt).toBeInstanceOf(Date);
  });
});
