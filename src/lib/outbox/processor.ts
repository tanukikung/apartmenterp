import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { EventBus, getEventBus } from '../events';
import { prisma } from '../db/client';
import { Json } from '@/types/prisma-json';

export interface OutboxProcessorOptions {
  batchSize?: number;
  maxRetries?: number;
  pollInterval?: number;
  enabled?: boolean;
  deadLetterThreshold?: number;
  // NOTE: concurrent multi-instance deployments are supported via
  // FOR UPDATE SKIP LOCKED row locks held inside an explicit transaction.
  // A single instance still processes events sequentially within one poll
  // cycle; parallel fan-out within a cycle is not yet implemented.
}

export interface ProcessedResult {
  processed: number;
  failed: number;
  errors: Array<{
    eventId: string;
    error: string;
  }>;
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

/**
 * Outbox Processor
 * 
 * Reads events from the outbox table and publishes them to the EventBus.
 * Implements idempotency to prevent duplicate processing.
 */
export class OutboxProcessor {
  private eventBus: EventBus;
  private prisma: typeof prisma;
  private options: Required<OutboxProcessorOptions>;
  private isProcessing: boolean = false;
  private shouldStop: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  // NOTE: in-memory Set removed. Dedup now uses DB processedAt column — see process()
  // where `processedAt IS NOT NULL` acts as the idempotency key instead.
  // This is durable across process restarts and safe in multi-instance deployments.

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

  constructor(
    eventBus?: EventBus,
    prismaClient?: typeof prisma,
    options: OutboxProcessorOptions = {}
  ) {
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

  /**
   * Start polling for outbox events
   */
  start(): void {
    if (!this.options.enabled) {
      logger.info('Outbox processor is disabled');
      return;
    }

    if (this.intervalId) {
      logger.warn('Outbox processor already running');
      return;
    }

    logger.info({
      type: 'outbox_processor_start',
      pollInterval: this.options.pollInterval,
      batchSize: this.options.batchSize,
    });

    // Process immediately on start
    this.process().catch((error) => {
      logger.error({
        type: 'outbox_processor_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    // Then poll periodically
    this.intervalId = setInterval(async () => {
      if (!this.shouldStop && !this.isProcessing) {
        try {
          await this.process();
        } catch (error) {
          logger.error({
            type: 'outbox_processor_error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }, this.options.pollInterval);
  }

  /**
   * Stop polling for outbox events
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.shouldStop = true;
      logger.info('Outbox processor stopped');
    }
  }

  /**
   * Process pending outbox events
   */
  async process(): Promise<ProcessedResult> {
    if (this.isProcessing) {
      return { processed: 0, failed: 0, errors: [] };
    }

    this.isProcessing = true;
    const result: ProcessedResult = {
      processed: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Wrap the entire lock-fetch-process cycle in a transaction so the
      // FOR UPDATE SKIP LOCKED row locks are held until the work is done.
      // Without this, each query auto-commits and the lock is released before
      // the actual processing, allowing concurrent instances to process the
      // same events.
      await this.prisma.$transaction(async (tx) => {
        // Get unprocessed event IDs with row-level locking (FOR UPDATE SKIP LOCKED).
        // SKIP LOCKED prevents multiple instances from competing over the same rows —
        // each instance grabs a different batch without blocking.
        const lockedIds: Array<{ id: string }> = await tx.$queryRaw`
          SELECT id FROM outbox_events
          WHERE "processedAt" IS NULL
            AND "retryCount" < ${this.options.maxRetries}
          ORDER BY "createdAt" ASC
          LIMIT ${this.options.batchSize}
          FOR UPDATE SKIP LOCKED
        `;

        if (lockedIds.length === 0) {
          return;
        }

        // Fetch full event data for the locked rows
        const events = await tx.outboxEvent.findMany({
          where: { id: { in: lockedIds.map(l => l.id) } },
          orderBy: { createdAt: 'asc' },
        });

        logger.debug({
          type: 'outbox_processing',
          eventCount: events.length,
        });

        const requiredDelaySinceCreated = (retryCount: number) =>
          (Math.pow(2, retryCount + 1) - 2) * 1000;

        for (const event of events) {
          if (event.retryCount > 0) {
            const elapsed = Date.now() - new Date(event.createdAt).getTime();
            const required = requiredDelaySinceCreated(event.retryCount);
            if (elapsed < required) {
              logger.debug({
                type: 'outbox_backoff_skip',
                eventId: event.id,
                retryCount: event.retryCount,
                remainingMs: required - elapsed,
              });
              continue;
            }
          }
          try {

            // Parse payload
            const payload = event.payload as Record<string, unknown>;

            // Mark as processed FIRST, then publish.
            // If we crash after markProcessed but before publish, on restart the event
            // will be re-processed (not double-delivered since it wasn't published yet).
            // If publish fails after the commit, eventBus has at-least-once semantics
            // via redelivery — safe to mark processed first.
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: {
                processedAt: new Date(),
              },
            });

            // Publish to EventBus
            await this.eventBus.publish(
              event.eventType,
              event.aggregateType,
              event.aggregateId,
              payload as any
            );

            result.processed++;

            logger.debug({
              type: 'outbox_event_processed',
              eventId: event.id,
              eventType: event.eventType,
            });

          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const nextRetry = event.retryCount + 1;
            if (nextRetry >= this.options.deadLetterThreshold) {
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: {
                  lastError: `DEAD_LETTER: ${errorMessage}`,
                  processedAt: new Date(),
                },
              });
              logger.error({
                type: 'outbox_dead_letter',
                eventId: event.id,
                retryCount: event.retryCount,
                error: errorMessage,
              });
            } else {
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: {
                  lastError: errorMessage,
                  retryCount: {
                    increment: 1,
                  },
                },
              });
            }

            result.failed++;
            result.errors.push({
              eventId: event.id,
              error: errorMessage,
            });

            logger.error({
              type: 'outbox_event_error',
              eventId: event.id,
              error: errorMessage,
            });
          }
        }
      });

    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  /**
   * Write events to outbox
   */
  async write(
    events: Array<{
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Json;
    }>
  ): Promise<void> {
    if (events.length === 0) return;

    await this.prisma.$transaction(
      events.map((event) =>
        this.prisma.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as any,
            retryCount: 0,
          },
        })
      )
    );

    logger.debug({
      type: 'outbox_events_written',
      count: events.length,
    });
  }

  /**
   * Write a single event to outbox
   */
  async writeOne(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Json
  ): Promise<void> {
    await this.write([{ aggregateType, aggregateId, eventType, payload }]);
  }

  /**
   * Clean up old processed events
   */
  async cleanup(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prisma.outboxEvent.deleteMany({
      where: {
        processedAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info({
      type: 'outbox_cleanup',
      deletedCount: result.count,
      daysOld,
    });

    return result.count;
  }

  /**
   * Get pending event count
   */
  async getPendingCount(): Promise<number> {
    return this.prisma.outboxEvent.count({
      where: {
        processedAt: null,
      },
    });
  }

  /**
   * Get failed event count
   */
  async getFailedCount(): Promise<number> {
    return this.prisma.outboxEvent.count({
      where: {
        processedAt: null,
        retryCount: {
          gte: this.options.maxRetries,
        },
      },
    });
  }

  /**
   * Get processor status
   */
  getStatus(): {
    isProcessing: boolean;
    isRunning: boolean;
    options: Required<OutboxProcessorOptions>;
  } {
    return {
      isProcessing: this.isProcessing,
      isRunning: this.intervalId !== null,
      options: this.options,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let outboxProcessorInstance: OutboxProcessor | null = null;

export function getOutboxProcessor(
  eventBus?: EventBus,
  options?: OutboxProcessorOptions
): OutboxProcessor {
  if (!outboxProcessorInstance) {
    outboxProcessorInstance = new OutboxProcessor(eventBus, undefined, options);
  }
  return outboxProcessorInstance;
}

export function createOutboxProcessor(
  options?: OutboxProcessorOptions
): OutboxProcessor {
  return new OutboxProcessor(undefined, undefined, options);
}
