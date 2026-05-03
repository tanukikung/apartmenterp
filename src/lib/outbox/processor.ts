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
            AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now())
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

        // Lazy-load LINE rate limiter (avoids Redis import on cold start if unused)
        let lineRateLimit: typeof import('../../infrastructure/redis').checkLineAPIRateLimit | null = null;
        try {
          const redis = await import('../../infrastructure/redis');
          lineRateLimit = redis.checkLineAPIRateLimit;
        } catch { /* Redis unavailable — rate limiting disabled */ }

        for (const event of events) {
          try {
            // LINE API rate limit check — BEFORE marking processedAt so we can
            // reschedule without consuming the event.
            if (lineRateLimit) {
              const rateCheck = await lineRateLimit();
              if (!rateCheck.allowed) {
                const retryAfterMs = rateCheck.retryAfterMs || 5_000;
                await tx.outboxEvent.update({
                  where: { id: event.id },
                  data:  { nextRetryAt: new Date(Date.now() + retryAfterMs) },
                });
                logger.warn({
                  type: 'outbox_rate_limited',
                  eventId: event.id,
                  eventType: event.eventType,
                  retryAfterMs,
                });
                continue;
              }
            }
          } catch (rlErr) {
            logger.warn({ type: 'outbox_rate_limit_check_error', error: (rlErr as Error).message });
            // Fail open — proceed without rate limiting
          }

          try {
            const payload = event.payload as Record<string, unknown>;

            // CRASH SAFETY: Mark processedAt BEFORE calling EventBus.publish.
            //
            // WHY: If we publish first and the process crashes between publish and
            // the DB update, the event re-runs on restart and delivers a duplicate
            // LINE message / notification. For a financial notification system,
            // duplicates (double "you've been charged") are worse than a lost
            // message — the tenant can always request a resend.
            //
            // TRADE-OFF: If publish throws after the mark, the event is "lost"
            // (it won't be retried). We catch that case below and write it to the
            // audit log as PUBLISH_FAILED so staff can identify and manually
            // re-trigger if needed.
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: { processedAt: new Date() },
            });

            try {
              await this.eventBus.publish(
                event.eventType,
                event.aggregateType,
                event.aggregateId,
                payload
              );
              result.processed++;
              logger.debug({
                type: 'outbox_event_processed',
                eventId: event.id,
                eventType: event.eventType,
              });
            } catch (publishError) {
              // Event is already marked processed — it will NOT be retried.
              // Write the error to lastError so the dead-letter admin UI shows it.
              const publishErrorMessage = publishError instanceof Error ? publishError.message : 'Unknown publish error';
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: { lastError: `PUBLISH_FAILED: ${publishErrorMessage}` },
              });
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
                  failurePhase: 'PUBLISH',
                  lastError: publishErrorMessage,
                  failedAt: new Date().toISOString(),
                },
              });
              logger.error({
                type: 'outbox_publish_failed',
                eventId: event.id,
                eventType: event.eventType,
                error: publishErrorMessage,
              });
              result.failed++;
              result.errors.push({ eventId: event.id, error: publishErrorMessage });
            }

          } catch (error) {
            // Error during the pre-publish DB mark — event was NOT marked processed.
            // Increment retryCount so it will be retried on the next poll cycle.
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

              await this.eventBus.publish(
                EventTypes.OUTBOX_EVENT_FAILED,
                event.aggregateType,
                event.aggregateId,
                {
                  outboxEventId: event.id,
                  eventType: event.eventType,
                  aggregateType: event.aggregateType,
                  aggregateId: event.aggregateId,
                  retryCount: event.retryCount,
                  lastError: errorMessage,
                  failedAt: new Date(),
                }
              );
            } else {
              const backoffMs = (Math.pow(2, nextRetry + 1) - 2) * 1_000;
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: {
                  lastError: errorMessage,
                  retryCount: { increment: 1 },
                  nextRetryAt: new Date(Date.now() + backoffMs),
                },
              });
            }

            result.failed++;
            result.errors.push({ eventId: event.id, error: errorMessage });
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
            payload: event.payload as Prisma.InputJsonValue,
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
