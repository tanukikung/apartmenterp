import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { EventBus, getEventBus, EventTypes } from '../events';
import { prisma } from '../db/client';
import { Json } from '@/types/prisma-json';
import { logAudit } from '@/modules/audit/audit.service';
import { inc, recordOutboxLatency } from '@/lib/metrics/messaging';

// ── Error helpers ─────────────────────────────────────────────────────────────

/** Derive a short machine-readable error code. */
function toErrorCode(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('429'))                                        return 'LINE_RATE_LIMIT';
  if (/\b40[0-8]\b/.test(msg))                                   return 'PERMANENT_4XX';
  if (/\b5\d{2}\b/.test(msg))                                    return 'LINE_SERVER_ERROR';
  if (msg.includes('timeout') || msg.includes('etimedout'))      return 'TIMEOUT';
  if (msg.includes('econnrefused') || msg.includes('econnreset')) return 'CONNECTION_ERROR';
  return 'UNKNOWN';
}

/**
 * 4xx errors (except 429 rate-limit) are PERMANENT — retrying won't help.
 * 401 Unauthorized: bad token; 403 Forbidden: feature not enabled for plan;
 * 400 Bad Request: malformed message (won't fix itself).
 * 429 and 5xx are transient and should be retried.
 */
function isPermanentError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('429')) return false; // rate limit → retry
  return /\b40[0-8]\b/.test(msg);       // 400–408 → permanent
}

/** Exponential backoff in ms with ±25 % jitter. */
function backoffWithJitter(retryCount: number): number {
  const baseMs   = (Math.pow(2, retryCount + 1) - 2) * 1_000;
  const jitterMs = Math.floor(Math.random() * baseMs * 0.25);
  return Math.max(1_000, baseMs + jitterMs);
}

/** Maximum age of an outbox event before it is forcibly dead-lettered (24 h). */
const MAX_RETRY_WINDOW_MS = 24 * 60 * 60 * 1_000;

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
          const startMs = Date.now();

          // ── Max retry window: dead-letter events older than 24 h ─────────
          const ageMs = Date.now() - new Date(event.createdAt).getTime();
          if (ageMs > MAX_RETRY_WINDOW_MS && event.retryCount > 0) {
            const windowMsg = `Max retry window exceeded (${Math.floor(ageMs / 3_600_000)}h)`;
            await tx.outboxEvent.update({
              where: { id: event.id },
              data:  {
                lastError:    `DEAD_LETTER: ${windowMsg}`,
                errorCode:    'MAX_WINDOW_EXCEEDED',
                lastFailedAt: new Date(),
                processedAt:  new Date(),
              },
            });
            inc('outbox_failed_total');
            logger.warn({
              type: 'outbox_max_window_dead_letter', eventId: event.id,
              eventType: event.eventType, ageHours: Math.floor(ageMs / 3_600_000),
            });
            result.failed++;
            result.errors.push({ eventId: event.id, error: windowMsg });
            continue;
          }

          try {
            // LINE API rate limit check — BEFORE marking processedAt so we can
            // reschedule without consuming the event.
            if (lineRateLimit) {
              const rateCheck = await lineRateLimit();
              if (!rateCheck.allowed) {
                const retryAfterMs = rateCheck.retryAfterMs || 5_000;
                await tx.outboxEvent.update({
                  where: { id: event.id },
                  data:  {
                    nextRetryAt:  new Date(Date.now() + retryAfterMs),
                    errorCode:    'LINE_RATE_LIMIT',
                    lastFailedAt: new Date(),
                  },
                });
                inc('outbox_rate_limited_total');
                logger.warn({
                  type: 'outbox_rate_limited', eventId: event.id,
                  eventType: event.eventType, retryAfterMs,
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
              recordOutboxLatency(Date.now() - startMs);
              inc('outbox_sent_total');
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
              const errCode = toErrorCode(publishError);
              await tx.outboxEvent.update({
                where: { id: event.id },
                data:  {
                  lastError:    `PUBLISH_FAILED: ${publishErrorMessage}`,
                  errorCode:    errCode,
                  lastFailedAt: new Date(),
                },
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
                  errorCode: errCode,
                  lastError: publishErrorMessage,
                  failedAt: new Date().toISOString(),
                },
              });
              inc('outbox_failed_total');
              logger.error({
                type: 'outbox_publish_failed', eventId: event.id,
                eventType: event.eventType, errorCode: errCode, error: publishErrorMessage,
              });
              result.failed++;
              result.errors.push({ eventId: event.id, error: publishErrorMessage });
            }

          } catch (error) {
            // Error during the pre-publish DB mark — event was NOT marked processed.
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const errCode  = toErrorCode(error);
            const nextRetry = event.retryCount + 1;
            const permanent = isPermanentError(error);

            // Permanent errors (4xx except 429) skip retries — dead-letter immediately
            const shouldDeadLetter = permanent || nextRetry >= this.options.deadLetterThreshold;

            if (shouldDeadLetter) {
              const dlReason = permanent ? `PERMANENT_ERROR: ${errorMessage}` : `DEAD_LETTER: ${errorMessage}`;
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: {
                  lastError:    dlReason,
                  errorCode:    permanent ? 'PERMANENT_4XX' : errCode,
                  lastFailedAt: new Date(),
                  processedAt:  new Date(),
                },
              });
              logger.error({
                type: permanent ? 'outbox_permanent_error' : 'outbox_dead_letter',
                eventId: event.id, eventType: event.eventType,
                errorCode: errCode, retryCount: event.retryCount, error: errorMessage,
              });
              if (permanent) inc('outbox_permanent_fail_total');

              await logAudit({
                actorId: 'SYSTEM', actorRole: 'SYSTEM', action: 'OUTBOX_EVENT_FAILED',
                entityType: event.aggregateType, entityId: event.aggregateId,
                metadata: {
                  severity: 'HIGH', outboxEventId: event.id, eventType: event.eventType,
                  aggregateType: event.aggregateType, aggregateId: event.aggregateId,
                  retryCount: event.retryCount, errorCode: errCode, lastError: errorMessage,
                  permanent, failedAt: new Date().toISOString(),
                },
              });

              await this.eventBus.publish(
                EventTypes.OUTBOX_EVENT_FAILED,
                event.aggregateType, event.aggregateId,
                {
                  outboxEventId: event.id, eventType: event.eventType,
                  aggregateType: event.aggregateType, aggregateId: event.aggregateId,
                  retryCount: event.retryCount, errorCode: errCode,
                  lastError: errorMessage, failedAt: new Date(),
                }
              );
            } else {
              // Transient error — schedule retry with jitter
              const backoffMs = backoffWithJitter(nextRetry);
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: {
                  lastError:    errorMessage,
                  errorCode:    errCode,
                  lastFailedAt: new Date(),
                  retryCount:   { increment: 1 },
                  nextRetryAt:  new Date(Date.now() + backoffMs),
                },
              });
            }

            inc('outbox_failed_total');
            result.failed++;
            result.errors.push({ eventId: event.id, error: errorMessage });
            logger.error({
              type: 'outbox_event_error', eventId: event.id,
              eventType: event.eventType, errorCode: errCode, error: errorMessage,
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
