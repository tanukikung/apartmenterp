import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxProcessor } from '@/lib/outbox/processor';

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock('@/lib/db/client', () => ({
  prisma: {
    outboxEvent: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/events', () => ({
  EventBus: vi.fn(),
  getEventBus: vi.fn(() => ({
    publish: vi.fn().mockResolvedValue(undefined),
  })),
  EventTypes: {},
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/modules/audit/audit.service', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/metrics/messaging', () => ({
  inc: vi.fn(),
  recordOutboxLatency: vi.fn(),
}));

const mockPrisma = (await import('@/lib/db/client')).prisma as any;
const mockEventBus = (await import('@/lib/events')).getEventBus();

// ── Helpers ─────────────────────────────────────────────────────────────────

function mockCount(statuses: string[], count: number) {
  mockPrisma.outboxEvent.count.mockResolvedValueOnce(count);
}

function mockFindFirst(returns: any) {
  mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce(returns);
}

function resetMocks() {
  mockPrisma.outboxEvent.count.mockReset();
  mockPrisma.outboxEvent.findFirst.mockReset();
  mockPrisma.outboxEvent.findMany.mockReset();
  mockPrisma.outboxEvent.create.mockReset();
  mockPrisma.outboxEvent.updateMany.mockReset();
  mockPrisma.$transaction.mockReset();
  mockPrisma.$queryRaw.mockReset();
  vi.clearAllMocks();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OutboxProcessor — backpressure', () => {

  describe('write() throws when pending >= MAX_PENDING_EVENTS', () => {
    it('throws OUTBOX_QUEUE_FULL when PENDING + PROCESSING sum hits limit', async () => {
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any);

      // write() uses one combined count query for { PENDING, PROCESSING }
      mockPrisma.outboxEvent.count.mockResolvedValueOnce(10_000);

      await expect(processor.write([{
        aggregateType: 'Invoice',
        aggregateId: '123',
        eventType: 'InvoiceCreated',
        payload: {},
      }])).rejects.toThrow('Outbox queue full, throttling');

      try {
        await processor.write([{
          aggregateType: 'Invoice',
          aggregateId: '123',
          eventType: 'InvoiceCreated',
          payload: {},
        }]);
      } catch (e: any) {
        expect(e.code).toBe('OUTBOX_QUEUE_FULL');
      }
    });

    it('allows writes when pending < MAX_PENDING_EVENTS', async () => {
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any);

      mockPrisma.outboxEvent.count.mockResolvedValueOnce(5_000);

      mockPrisma.$transaction.mockImplementation(async (fn: any) =>
        fn(mockPrisma)
      );
      mockPrisma.outboxEvent.create.mockResolvedValue({ id: 'new-id' });

      await expect(processor.write([{
        aggregateType: 'Invoice',
        aggregateId: '123',
        eventType: 'InvoiceCreated',
        payload: {},
      }])).resolves.toBeUndefined();
    });
  });

  describe('adaptive batch sizing activates when lag > 30s', () => {
    it('doubles batch size when processing lag > 30_000 ms', async () => {
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any, {
        batchSize: 100,
      });

      // Simulate: queue has events, oldest created 35s ago → lag > 30s
      mockPrisma.outboxEvent.count.mockResolvedValueOnce(200);

      // Mock findFirst for lag calculation
      mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 35_000),
      });

      // Mock empty $transaction result (no events to claim on first call)
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      expect(processor.getCurrentBatchSize()).toBe(100);

      await processor.process();

      // After high lag, batch size should have doubled (up to MAX=500)
      expect(processor.getCurrentBatchSize()).toBe(200);
    });

    it('does NOT double when lag < 30_000 ms', async () => {
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any, {
        batchSize: 100,
      });

      mockPrisma.outboxEvent.count.mockResolvedValueOnce(50);
      mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 10_000), // 10s lag
      });

      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      const initialBatchSize = processor.getCurrentBatchSize();
      await processor.process();

      // Should stay the same (no doubling, no halving since < 3 low-lag cycles)
      expect(processor.getCurrentBatchSize()).toBe(initialBatchSize);
    });

    it('halves batch size after 3 consecutive cycles with lag < 5_000 ms', async () => {
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any, {
        batchSize: 100,
      });

      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
      mockPrisma.$queryRaw.mockResolvedValue([]);

      for (let i = 0; i < 3; i++) {
        mockPrisma.outboxEvent.count.mockResolvedValueOnce(10);
        mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce({
          createdAt: new Date(Date.now() - 1_000), // 1s lag — below 5s threshold
        });
        await processor.process();
      }

      // After 3 low-lag cycles, batch size should halve to 50
      expect(processor.getCurrentBatchSize()).toBe(50);
    });

    it('caps batch size at MAX_BATCH_SIZE (500)', async () => {
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any, {
        batchSize: 500,
      });

      mockPrisma.outboxEvent.count.mockResolvedValueOnce(1000);
      mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 60_000),
      });

      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      await processor.process();

      // Already at MAX_BATCH_SIZE — stays at 500 (doubled would exceed cap, so capped)
      expect(processor.getCurrentBatchSize()).toBeLessThanOrEqual(500);
    });

    it('floors batch size at MIN_BATCH_SIZE (10)', async () => {
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any, {
        batchSize: 10,
      });

      mockPrisma.outboxEvent.count.mockResolvedValueOnce(5);
      mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 1_000),
      });

      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      // 3 low-lag cycles
      for (let i = 0; i < 3; i++) {
        mockPrisma.outboxEvent.count.mockResolvedValueOnce(5);
        mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce({
          createdAt: new Date(Date.now() - 1_000),
        });
        await processor.process();
      }

      expect(processor.getCurrentBatchSize()).toBeGreaterThanOrEqual(10);
    });
  });

  describe('lag alert logged when > 60s', () => {
    it('emits outbox_lag_alert ERROR log when lag > 60_000 ms', async () => {
      const { logger } = await import('@/lib/utils/logger');
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any);

      mockPrisma.outboxEvent.count
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(0);
      mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 65_000), // 65s lag
      });

      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      await processor.process();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'outbox_lag_alert',
          lagMs: expect.any(Number),
          queueDepth: expect.any(Number),
          oldestEventAgeMs: expect.any(Number),
        })
      );
      const lagAlertCall = (logger.error as any).mock.calls.find(
        (call: any[]) => call[0]?.type === 'outbox_lag_alert'
      );
      expect(lagAlertCall[0].lagMs).toBeGreaterThan(60_000);
    });

    it('does NOT emit lag alert when lag < 60_000 ms', async () => {
      const { logger } = await import('@/lib/utils/logger');
      const processor = new OutboxProcessor(mockEventBus as any, mockPrisma as any);

      mockPrisma.outboxEvent.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(0);
      mockPrisma.outboxEvent.findFirst.mockResolvedValueOnce({
        createdAt: new Date(Date.now() - 30_000), // 30s lag
      });

      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      await processor.process();

      const lagAlertCalls = (logger.error as any).mock.calls.filter(
        (call: any[]) => call[0]?.type === 'outbox_lag_alert'
      );
      expect(lagAlertCalls).toHaveLength(0);
    });
  });
});
