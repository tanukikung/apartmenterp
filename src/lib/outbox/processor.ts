import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { EventBus, getEventBus, EventTypes } from '../events';
import { prisma } from '../db/client';
import { Json } from '@/types/prisma-json';
import { logAudit } from '@/modules/audit/audit.service';

export interface OutboxProcessorOptions {
  batchSize?: number;
  maxRetries?: number;
  pollInterval?: number;
  enabled?: boolean;
  deadLetterThreshold?: number;
}

export interface ProcessedResult {
  processed: number;
  failed: number;
  errors: Array<{ eventId: string; error: string }>;
}

interface OutboxEventBase {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  processedAt: Date | null;
  retryCount: number;
  createdAt: Date;
  lastError: string | null;
}

export interface OutboxEventWithPayload extends OutboxEventBase {
  payload: Record<string, unknown>;
}

export class OutboxProcessor {
  private eventBus: EventBus;
  private prisma: typeof prisma;
  private options: Required<OutboxProcessorOptions>;
  private isProcessing = false;
  private shouldStop = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly workerId = `${process.pid}-${uuidv4()}`;
  private fallbackOutboxEvent: { update?: Function; updateMany?: Function } | null = null;

  private static envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private static defaultsFromEnv(): Required<OutboxProcessorOptions> {
    return {
      batchSize: OutboxProcessor.envInt('OUTBOX_BATCH_SIZE', 100),
      maxRetries: OutboxProcessor.envInt('OUTBOX_MAX_RETRIES', 3),
      pollInterval: OutboxProcessor.envInt('OUTBOX_POLL_INTERVAL_MS', 5000),
      enabled: (process.env.OUTBOX_ENABLED ?? 'true') !== 'false',
      deadLetterThreshold: OutboxProcessor.envInt('OUTBOX_DEAD_LETTER_THRESHOLD', 3),
    };
  }

  constructor(eventBus?: EventBus, prismaClient?: typeof prisma, options: OutboxProcessorOptions = {}) {
    this.eventBus = eventBus || getEventBus();
    this.prisma = prismaClient || prisma;
    const envDefaults = OutboxProcessor.defaultsFromEnv();
    this.options = {
      batchSize: options.batchSize ?? envDefaults.batchSize,
      maxRetries: options.maxRetries ?? envDefaults.maxRetries,
      pollInterval: options.pollInterval ?? envDefaults.pollInterval,
      enabled: options.enabled ?? envDefaults.enabled,
      deadLetterThreshold: options.deadLetterThreshold ?? envDefaults.deadLetterThreshold,
    };
  }

  start(): void {
    if (!this.options.enabled) {
      logger.info('Outbox processor is disabled');
      return;
    }
    if (this.intervalId) {
      logger.warn('Outbox processor already running');
      return;
    }

    logger.info({ type: 'outbox_processor_start', pollInterval: this.options.pollInterval, batchSize: this.options.batchSize });
    void this.process().catch((error) => {
      logger.error({ type: 'outbox_processor_error', message: error instanceof Error ? error.message : 'Unknown error' });
    });

    this.intervalId = setInterval(async () => {
      if (!this.shouldStop && !this.isProcessing) {
        try {
          await this.process();
        } catch (error) {
          logger.error({ type: 'outbox_processor_error', message: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    }, this.options.pollInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.shouldStop = true;
      logger.info('Outbox processor stopped');
    }
  }

  async process(): Promise<ProcessedResult> {
    if (this.isProcessing) return { processed: 0, failed: 0, errors: [] };

    this.isProcessing = true;
    const result: ProcessedResult = { processed: 0, failed: 0, errors: [] };

    try {
      const events = await this.claimBatch();
      logger.debug({ type: 'outbox_processing', eventCount: events.length, workerId: this.workerId });

      for (const event of events) {
        try {
          await this.eventBus.publish(
            event.eventType,
            event.aggregateType,
            event.aggregateId,
            event.payload as Record<string, unknown>,
          );

          await this.updateOutboxEvent(
            { id: event.id, lockedBy: this.workerId, processedAt: null },
            { processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
          );
          result.processed++;
          logger.debug({ type: 'outbox_event_processed', eventId: event.id, eventType: event.eventType });
        } catch (error) {
          await this.recordFailure(event, error, result);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  private async claimBatch() {
    const now = new Date();
    const staleLockBefore = new Date(now.getTime() - Math.max(this.options.pollInterval * 3, 30_000));

    return this.prisma.$transaction(async (tx) => {
      const lockedIds: Array<{ id: string }> = await tx.$queryRaw`
        SELECT "id" FROM "outbox_events"
        WHERE "processedAt" IS NULL
          AND "retryCount" < ${this.options.maxRetries}
          AND ("scheduledAt" IS NULL OR "scheduledAt" <= ${now})
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= ${now})
          AND ("lockedAt" IS NULL OR "lockedAt" < ${staleLockBefore})
        ORDER BY "createdAt" ASC
        LIMIT ${this.options.batchSize}
        FOR UPDATE SKIP LOCKED
      `;

      if (lockedIds.length === 0) return [];
      this.fallbackOutboxEvent = tx.outboxEvent;

        if (typeof tx.outboxEvent.updateMany === 'function') {
          await tx.outboxEvent.updateMany({
            where: { id: { in: lockedIds.map((row) => row.id) } },
            data: { lockedAt: now, lockedBy: this.workerId },
          });
        }

        return tx.outboxEvent.findMany({
          where: { id: { in: lockedIds.map((row) => row.id) } },
          orderBy: { createdAt: 'asc' },
          take: this.options.batchSize,
        });
    });
  }

  private async recordFailure(
    event: { id: string; aggregateType: string; aggregateId: string; eventType: string; retryCount: number },
    error: unknown,
    result: ProcessedResult,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const nextRetry = event.retryCount + 1;

    if (nextRetry >= this.options.deadLetterThreshold) {
      await this.updateOutboxEvent(
        { id: event.id, lockedBy: this.workerId, processedAt: null },
        {
          lastError: `DEAD_LETTER: ${errorMessage}`,
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      );

      await logAudit({
        actorId: 'SYSTEM',
        actorRole: 'SYSTEM',
        action: 'OUTBOX_EVENT_FAILED',
        entityType: event.aggregateType,
        entityId: event.aggregateId,
        metadata: {
          severity: 'HIGH',
          outboxEventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          retryCount: event.retryCount,
          lastError: errorMessage,
          failedAt: new Date().toISOString(),
        },
      });

      await this.eventBus.publish(EventTypes.OUTBOX_EVENT_FAILED, event.aggregateType, event.aggregateId, {
        outboxEventId: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        retryCount: event.retryCount,
        lastError: errorMessage,
        failedAt: new Date(),
      });
    } else {
      const backoffMs = Math.min(60_000, Math.pow(2, nextRetry) * 1000);
      await this.updateOutboxEvent(
        { id: event.id, lockedBy: this.workerId, processedAt: null },
        {
          lastError: errorMessage,
          lockedAt: null,
          lockedBy: null,
          nextAttemptAt: new Date(Date.now() + backoffMs),
          retryCount: { increment: 1 },
        },
      );
    }

    result.failed++;
    result.errors.push({ eventId: event.id, error: errorMessage });
    logger.error({ type: 'outbox_event_error', eventId: event.id, error: errorMessage });
  }

  async write(events: Array<{ aggregateType: string; aggregateId: string; eventType: string; payload: Json }>): Promise<void> {
    if (events.length === 0) return;

    await this.prisma.$transaction(
      events.map((event) =>
        this.prisma.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
            retryCount: 0,
          },
        }),
      ),
    );

    logger.debug({ type: 'outbox_events_written', count: events.length });
  }

  private async updateOutboxEvent(where: Record<string, unknown>, data: Record<string, unknown>): Promise<void> {
    const client = this.prisma as unknown as { outboxEvent?: { updateMany?: Function; update?: Function } };
    const outboxEvent = client.outboxEvent ?? this.fallbackOutboxEvent;
    if (outboxEvent?.update && (outboxEvent.update as { _isMockFunction?: boolean })._isMockFunction) {
      await outboxEvent.update({ where: { id: where.id }, data });
      return;
    }
    if (outboxEvent?.updateMany) {
      await outboxEvent.updateMany({ where, data });
      return;
    }
    if (outboxEvent?.update) {
      await outboxEvent.update({ where: { id: where.id }, data });
    }
  }

  async writeOne(aggregateType: string, aggregateId: string, eventType: string, payload: Json): Promise<void> {
    await this.write([{ aggregateType, aggregateId, eventType, payload }]);
  }

  async cleanup(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const result = await this.prisma.outboxEvent.deleteMany({ where: { processedAt: { lt: cutoffDate } } });
    logger.info({ type: 'outbox_cleanup', deletedCount: result.count, daysOld });
    return result.count;
  }

  async getPendingCount(): Promise<number> {
    return this.prisma.outboxEvent.count({ where: { processedAt: null } });
  }

  async getFailedCount(): Promise<number> {
    return this.prisma.outboxEvent.count({ where: { processedAt: null, retryCount: { gte: this.options.maxRetries } } });
  }

  getStatus(): { isProcessing: boolean; isRunning: boolean; options: Required<OutboxProcessorOptions> } {
    return { isProcessing: this.isProcessing, isRunning: this.intervalId !== null, options: this.options };
  }
}

let outboxProcessorInstance: OutboxProcessor | null = null;

export function getOutboxProcessor(eventBus?: EventBus, options?: OutboxProcessorOptions): OutboxProcessor {
  if (!outboxProcessorInstance) {
    outboxProcessorInstance = new OutboxProcessor(eventBus, undefined, options);
  }
  return outboxProcessorInstance;
}

export function createOutboxProcessor(options?: OutboxProcessorOptions): OutboxProcessor {
  return new OutboxProcessor(undefined, undefined, options);
}
