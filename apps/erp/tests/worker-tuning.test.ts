import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OutboxProcessor } from '@/lib/outbox/processor';
import { prisma } from '@/lib/db/client';
import { getEventBus } from '@/lib/events';

describe('Outbox worker env/config and behavior', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.OUTBOX_BATCH_SIZE;
    delete process.env.OUTBOX_MAX_RETRIES;
    delete process.env.OUTBOX_POLL_INTERVAL_MS;
    delete process.env.OUTBOX_DEAD_LETTER_THRESHOLD;
    delete process.env.OUTBOX_CONCURRENCY;
  });

  it('reads defaults from env when options not provided', () => {
    process.env.OUTBOX_BATCH_SIZE = '7';
    process.env.OUTBOX_MAX_RETRIES = '9';
    process.env.OUTBOX_POLL_INTERVAL_MS = '3210';
    process.env.OUTBOX_DEAD_LETTER_THRESHOLD = '4';
    process.env.OUTBOX_CONCURRENCY = '2';
    const p = new OutboxProcessor(undefined, prisma as any, undefined);
    const st = p.getStatus();
    expect(st.options.batchSize).toBe(7);
    expect(st.options.maxRetries).toBe(9);
    expect(st.options.pollInterval).toBe(3210);
    expect(st.options.deadLetterThreshold).toBe(4);
    expect(st.options.concurrency).toBe(2);
  });

  it('respects batchSize in findMany take and continues on failures', async () => {
    const events: any[] = [
      { id: 'e1', aggregateType: 'T', aggregateId: '1', eventType: 'EV', payload: {}, processedAt: null, retryCount: 0, createdAt: new Date(), lastError: null },
      { id: 'e2', aggregateType: 'T', aggregateId: '2', eventType: 'EV', payload: {}, processedAt: null, retryCount: 0, createdAt: new Date(), lastError: null },
      { id: 'e3', aggregateType: 'T', aggregateId: '3', eventType: 'EV', payload: {}, processedAt: null, retryCount: 0, createdAt: new Date(), lastError: null },
    ];
    const p: any = prisma as any;
    p.outboxEvent = p.outboxEvent || {};
    const findSpy = vi.spyOn(p.outboxEvent, 'findMany').mockImplementation(async (args: any) => {
      return events.slice(0, args.take);
    });
    const updates: Record<string, any> = {};
    vi.spyOn(p.outboxEvent, 'update').mockImplementation(async ({ where, data }: any) => {
      updates[where.id] = { ...(updates[where.id] || {}), ...data };
      return { ...events.find((e) => e.id === where.id), ...updates[where.id] };
    });
    const bus = getEventBus();
    vi.spyOn(bus, 'publish' as any)
      .mockRejectedValueOnce(new Error('boom'))   // first fails
      .mockResolvedValueOnce({})                  // second ok
      .mockResolvedValueOnce({});                 // third ok
    const proc = new OutboxProcessor(bus as any, prisma as any, { batchSize: 2, maxRetries: 3, pollInterval: 9999, enabled: false });
    const res = await proc.process();
    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(res.processed + res.failed).toBeGreaterThan(0);
    expect(res.failed).toBe(1);
  });

  it('dead-letters when retry exceeds threshold', async () => {
    const events: any[] = [
      { id: 'e1', aggregateType: 'T', aggregateId: '1', eventType: 'EV', payload: {}, processedAt: null, retryCount: 4, createdAt: new Date(Date.now() - 60_000), lastError: null },
    ];
    const p: any = prisma as any;
    p.outboxEvent = p.outboxEvent || {};
    vi.spyOn(p.outboxEvent, 'findMany').mockResolvedValue(events);
    const updated: any[] = [];
    vi.spyOn(p.outboxEvent, 'update').mockImplementation(async ({ where, data }: any) => {
      updated.push({ where, data });
      return { ...events[0], ...data };
    });
    const bus = getEventBus();
    vi.spyOn(bus, 'publish' as any).mockRejectedValue(new Error('always fail'));
    const proc = new OutboxProcessor(bus as any, prisma as any, { maxRetries: 5, deadLetterThreshold: 4, batchSize: 10, pollInterval: 9999, enabled: false });
    const res = await proc.process();
    expect(res.failed).toBe(1);
    const last = updated.pop();
    expect(last.data.lastError).toMatch(/DEAD_LETTER/);
    expect(last.data.processedAt).toBeInstanceOf(Date);
  });
});

