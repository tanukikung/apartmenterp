import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { EventBus, getEventBus } from '../events';
import { prisma } from '../db/client';
import { Json } from '@/types/prisma-json';
import { logAudit } from '@/modules/audit/audit.service';
import { inc, recordOutboxLatency } from '@/lib/metrics/messaging';
import { alertOutboxDeadLetter } from '@/lib/alerting/alerts';
import { computeMessageHash } from './message-hash';

// ── Constants ────────────────────────────────────────────────────────────────

/** Default visibility timeout — how long a row can stay PROCESSING before
 * being considered stuck and reset to PENDING. Configurable via
 * OUTBOX_VISIBILITY_TIMEOUT_MS env var. Must exceed maximum processing time
 * for any handler (LINE API can take up to 30s under load). */
const DEFAULT_VISIBILITY_TIMEOUT_MS = 60_000; // 60s ( generous for LINE API )

/** Maximum age before an event is dead-lettered regardless of retry count. */
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1_000; // 24h

/** How often to run visibility-timeout recovery (every poll cycle is fine,
 * but we batch all stuck rows in a single recovery call). */
const VISIBILITY_RECOVERY_INTERVAL_MS = 60_000;

/** Maximum pending (PENDING + PROCESSING) events before write() refuses new events.
 * Configurable via OUTBOX_MAX_PENDING_EVENTS env var. */
const MAX_PENDING_EVENTS = Number.parseInt(process.env.OUTBOX_MAX_PENDING_EVENTS ?? '10000', 10);

/** Hard upper bound for adaptive batch sizing. */
const MAX_BATCH_SIZE = 500;

/** Hard lower bound for adaptive batch sizing. */
const MIN_BATCH_SIZE = 10;

/** Lag threshold (ms) above which batch size doubles for the next cycle. */
const LAG_THRESHOLD_DOUBLE = 30_000; // 30s

/** Lag threshold (ms) below which batch size halves after 3 consecutive cycles. */
const LAG_THRESHOLD_HALVE = 5_000; // 5s

/** Number of consecutive low-lag cycles required before halving batch size. */
const LOW_LAG_CYCLES_BEFORE_HALVE = 3;

/** Lag threshold (ms) above which a high-severity lag alert is emitted. */
const LAG_ALERT_THRESHOLD_MS = 60_000; // 60s

// ── Error helpers ─────────────────────────────────────────────────────────────

function toErrorCode(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('429'))                                        return 'LINE_RATE_LIMIT';
  if (/\b40[0-8]\b/.test(msg))                                   return 'PERMANENT_4XX';
  if (/\b5\d{2}\b/.test(msg))                                    return 'LINE_SERVER_ERROR';
  if (msg.includes('timeout') || msg.includes('etimedout'))      return 'TIMEOUT';
  if (msg.includes('econnrefused') || msg.includes('econnreset')) return 'CONNECTION_ERROR';
  return 'UNKNOWN';
}

function isPermanentError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('429')) return false;
  return /\b40[0-8]\b/.test(msg);
}

function backoffWithJitter(retryCount: number): number {
  const baseMs   = (Math.pow(2, retryCount + 1) - 2) * 1_000;
  const jitterMs = Math.floor(Math.random() * baseMs * 0.25);
  return Math.max(1_000, baseMs + jitterMs);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutboxProcessorOptions {
  batchSize?: number;
  maxRetries?: number;
  pollInterval?: number;
  enabled?: boolean;
  deadLetterThreshold?: number;
  visibilityTimeoutMs?: number;
}

export interface ProcessedResult {
  processed: number;
  failed: number;
  skippedDuplicate: number;
  errors: Array<{ eventId: string; error: string }>;
}

export interface OutboxEventWithPayload {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  processingAt: Date | null;
  processedAt: Date | null;
  retryCount: number;
  createdAt: Date;
  lastError: string | null;
  deduplicationKey: string | null;
  messageHash: string | null;
  externalId: string | null;
  callerIdempotencyKey: string | null;
}

interface OutboxEventRow {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  status: string;
  processingAt: Date | null;
  processedAt: Date | null;
  retryCount: number;
  createdAt: Date;
  lastError: string | null;
  deduplicationKey: string | null;
  messageHash: string | null;
  externalId: string | null;
  callerIdempotencyKey: string | null;
}

// ── Outbox Processor ──────────────────────────────────────────────────────────

export class OutboxProcessor {
  private eventBus: EventBus;
  private prisma: typeof prisma;
  private options: Required<OutboxProcessorOptions>;
  private isProcessing = false;
  private shouldStop = false;
  private intervalId: NodeJS.Timeout | null = null;
  private lastVisibilityRecovery = 0;

  /** Adaptive batch sizing state */
  private _currentBatchSize: number;
  private _consecutiveLowLagCycles = 0;

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
      visibilityTimeoutMs: OutboxProcessor.envInt('OUTBOX_VISIBILITY_TIMEOUT_MS', DEFAULT_VISIBILITY_TIMEOUT_MS),
    };
  }

  constructor(eventBus?: EventBus, prismaClient?: typeof prisma, options: OutboxProcessorOptions = {}) {
    this.eventBus = eventBus || getEventBus();
    this.prisma = prismaClient || prisma;
    const envDefaults = OutboxProcessor.defaultsFromEnv();
    const initialBatchSize = options.batchSize ?? envDefaults.batchSize;
    this.options = {
      batchSize: initialBatchSize,
      maxRetries: options.maxRetries ?? envDefaults.maxRetries,
      pollInterval: options.pollInterval ?? envDefaults.pollInterval,
      enabled: options.enabled ?? envDefaults.enabled,
      deadLetterThreshold: options.deadLetterThreshold ?? envDefaults.deadLetterThreshold,
      visibilityTimeoutMs: options.visibilityTimeoutMs ?? envDefaults.visibilityTimeoutMs,
    };
    this._currentBatchSize = initialBatchSize;
  }

  start(): void {
    if (!this.options.enabled) {
      logger.info('Outbox processor is disabled');
      return;
    }

    // Recovery: reset stuck PROCESSING rows on startup
    this.recoverStuckProcessing().catch((e) => {
      logger.error({ type: 'outbox_visibility_recovery_failed', error: e instanceof Error ? e.message : String(e) });
    });

    logger.info({
      type: 'outbox_processor_start',
      pollInterval: this.options.pollInterval,
      batchSize: this._currentBatchSize,
      maxPendingEvents: MAX_PENDING_EVENTS,
      visibilityTimeoutMs: this.options.visibilityTimeoutMs,
    });

    this.process().catch((error) => {
      logger.error({ type: 'outbox_processor_error', message: error instanceof Error ? error.message : 'Unknown error' });
    });

    this.intervalId = setInterval(async () => {
      if (this.shouldStop) return;

      // Periodic visibility-timeout recovery
      const now = Date.now();
      if (now - this.lastVisibilityRecovery > VISIBILITY_RECOVERY_INTERVAL_MS) {
        this.lastVisibilityRecovery = now;
        this.recoverStuckProcessing().catch((e) => {
          logger.error({ type: 'outbox_visibility_recovery_failed', error: e instanceof Error ? e.message : String(e) });
        });
      }

      if (!this.isProcessing) {
        this.process().catch((error) => {
          logger.error({ type: 'outbox_processor_error', message: error instanceof Error ? error.message : 'Unknown error' });
        });
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

  /**
   * Reset PROCESSING rows that have been stuck longer than VISIBILITY_TIMEOUT_MS.
   * Multi-instance safe: uses FOR UPDATE SKIP LOCKED so only one instance does the reset.
   */
  private async recoverStuckProcessing(): Promise<void> {
    const timeout = new Date(Date.now() - this.options.visibilityTimeoutMs);
    await this.prisma.$transaction(async (tx) => {
      const stuck: Array<{ id: string }> = await tx.$queryRaw`
        SELECT id FROM outbox_events
        WHERE status = 'PROCESSING'
          AND "processingAt" < ${timeout}
        FOR UPDATE SKIP LOCKED
      `;
      if (stuck.length === 0) return;

      await tx.outboxEvent.updateMany({
        where: { id: { in: stuck.map(s => s.id) } },
        data: {
          status: 'PENDING',
          processingAt: null,
          // increment retryCount so they don't infinite-loop on a permanently broken event
          retryCount: { increment: 1 },
          lastError: `Visibility timeout exceeded (${this.options.visibilityTimeoutMs}ms). Event was reset to PENDING.`,
        },
      });

      logger.warn({
        type: 'outbox_visibility_recovery',
        count: stuck.length,
        oldestMs: Date.now() - timeout.getTime(),
      });
    });
  }

  /**
   * Returns current queue depth (PENDING + PROCESSING events).
   */
  async getQueueDepth(): Promise<number> {
    const [pending, processing] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
      this.prisma.outboxEvent.count({ where: { status: 'PROCESSING' } }),
    ]);
    return pending + processing;
  }

  /**
   * Returns processing lag in milliseconds: now - createdAt of the oldest PENDING event.
   * Returns 0 if no pending events.
   */
  async getProcessingLagMs(): Promise<number> {
    const oldest = await this.prisma.outboxEvent.findFirst({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    if (!oldest) return 0;
    return Date.now() - new Date(oldest.createdAt).getTime();
  }

  /** Exposes adaptive batch size for external consumers (e.g. metrics snapshots). */
  getCurrentBatchSize(): number {
    return this._currentBatchSize;
  }

  async process(): Promise<ProcessedResult> {
    if (this.isProcessing) {
      return { processed: 0, failed: 0, skippedDuplicate: 0, errors: [] };
    }

    this.isProcessing = true;
    const result: ProcessedResult = { processed: 0, failed: 0, skippedDuplicate: 0, errors: [] };

    try {
      // ── Compute metrics for adaptive batch sizing ──────────────────────────
      const [queueDepth, processingLagMs] = await Promise.all([
        this.getQueueDepth(),
        this.getProcessingLagMs(),
      ]);

      // Adaptive batch sizing
      if (processingLagMs > LAG_THRESHOLD_DOUBLE) {
        // Lag is high — double batch size up to MAX_BATCH_SIZE
        this._currentBatchSize = Math.min(this._currentBatchSize * 2, MAX_BATCH_SIZE);
        this._consecutiveLowLagCycles = 0;
        logger.info({ type: 'outbox_batch_size_increase', currentBatchSize: this._currentBatchSize, processingLagMs });
      } else if (processingLagMs < LAG_THRESHOLD_HALVE) {
        this._consecutiveLowLagCycles++;
        if (this._consecutiveLowLagCycles >= LOW_LAG_CYCLES_BEFORE_HALVE) {
          this._currentBatchSize = Math.max(this._currentBatchSize / 2, MIN_BATCH_SIZE);
          this._consecutiveLowLagCycles = 0;
          logger.info({ type: 'outbox_batch_size_decrease', currentBatchSize: this._currentBatchSize, processingLagMs });
        }
      } else {
        this._consecutiveLowLagCycles = 0;
      }

      // Lag alert
      if (processingLagMs > LAG_ALERT_THRESHOLD_MS) {
        logger.error({
          type: 'outbox_lag_alert',
          lagMs: processingLagMs,
          queueDepth,
          oldestEventAgeMs: processingLagMs,
        });
      }

      await this.prisma.$transaction(async (tx) => {
        // ── Step 1: Claim rows (PENDING only, with FOR UPDATE SKIP LOCKED)
        // This atomically transitions PENDING → PROCESSING so multi-instance
        // deployments never double-process the same row.
        const claimed: Array<{ id: string }> = await tx.$queryRaw`
          SELECT id FROM outbox_events
          WHERE status = 'PENDING'
            AND "retryCount" < ${this.options.maxRetries}
            AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now())
          ORDER BY "createdAt" ASC
          LIMIT ${this._currentBatchSize}
          FOR UPDATE SKIP LOCKED
        `;

        if (claimed.length === 0) return;

        // ── Step 2: Transition PENDING → PROCESSING
        // Mark processingAt so other workers see it as "in progress"
        await tx.outboxEvent.updateMany({
          where: { id: { in: claimed.map(c => c.id) } },
          data: {
            status: 'PROCESSING',
            processingAt: new Date(),
          },
        });

        // ── Step 3: Fetch full event data
        const events = await tx.outboxEvent.findMany({
          where: { id: { in: claimed.map(c => c.id) } },
          orderBy: { createdAt: 'asc' },
        });

        logger.debug({ type: 'outbox_processing', eventCount: events.length, currentBatchSize: this._currentBatchSize });

        // ── Step 4: Lazy-load LINE rate limiter
        let lineRateLimit: typeof import('../../infrastructure/redis').checkLineAPIRateLimit | null = null;
        try {
          const redis = await import('../../infrastructure/redis');
          lineRateLimit = redis.checkLineAPIRateLimit;
        } catch { /* Redis unavailable — rate limiting disabled */ }

        // ── Step 5: Process each event
        for (const event of events as OutboxEventRow[]) {
          const startMs = Date.now();
          const payload = event.payload as Record<string, unknown>;

          // 5a: Skip CANCELLED events — they were cancelled by source (e.g., invoice cancelled)
          if (event.status === 'CANCELLED') {
            inc('outbox_cancelled_total');
            logger.info({ type: 'outbox_cancelled_skipped', eventId: event.id, eventType: event.eventType });
            result.processed++;
            continue;
          }

          // 5b: Safety gate — verify source entity is still in a sendable state.
          // Prevents LINE delivery for invoices that were cancelled after the event was queued.
          if (event.aggregateType === 'Invoice') {
            const invoice = await tx.invoice.findUnique({
              where: { id: event.aggregateId },
              select: { status: true },
            });
            if (!invoice || invoice.status === 'CANCELLED') {
              // Invoice no longer sendable — mark event cancelled and skip.
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: { status: 'CANCELLED' },
              });
              inc('outbox_cancelled_total');
              logger.info({ type: 'outbox_invoice_cancelled_skipped', eventId: event.id, invoiceStatus: invoice?.status });
              result.processed++;
              continue;
            }
          }

          // 5c: Max event age → dead-letter
          const ageMs = Date.now() - new Date(event.createdAt).getTime();
          if (ageMs > MAX_EVENT_AGE_MS && event.retryCount > 0) {
            await this.deadLetter(tx, event.id, `Max age exceeded (${Math.floor(ageMs / 3_600_000)}h)`, 'MAX_AGE_EXCEEDED', result, event.aggregateType, event.aggregateId, event.eventType, event.retryCount, payload, this.options.deadLetterThreshold, event.createdAt);
            continue;
          }

          // 5b: LINE rate limit check
          if (lineRateLimit) {
            try {
              const check = await lineRateLimit();
              if (!check.allowed) {
                const retryAfterMs = check.retryAfterMs || 5_000;
                await tx.outboxEvent.update({
                  where: { id: event.id },
                  data: { nextRetryAt: new Date(Date.now() + retryAfterMs), errorCode: 'LINE_RATE_LIMIT', lastFailedAt: new Date() },
                });
                inc('outbox_rate_limited_total');
                logger.warn({ type: 'outbox_rate_limited', eventId: event.id, retryAfterMs });
                result.failed++;
                continue;
              }
            } catch (rlErr) {
              logger.warn({ type: 'outbox_rate_limit_check_error', error: (rlErr as Error).message });
              // Fail closed for LINE API — prevent unbounded burst that could exhaust quota.
              // The outbox will be retried on next poll when Redis is available again.
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: {
                  status: 'PENDING',
                  processingAt: null,
                  retryCount: { increment: 1 },
                  lastError: `Rate limit check failed: ${(rlErr as Error).message}`,
                  errorCode: 'RATE_LIMIT_CHECK_FAILED',
                  lastFailedAt: new Date(),
                  nextRetryAt: new Date(Date.now() + 5_000),
                },
              });
              inc('outbox_failed_total');
              result.failed++;
              result.errors.push({ eventId: event.id, error: String(rlErr) });
              continue;
            }
          }

          // 5c: Exactly-once deduplication via callerIdempotencyKey (most specific) and messageHash.
          // Three-layer dedup:
          //   Layer 1 — caller-provided idempotency key (most specific, caller knows intent)
          //   Layer 2 — messageHash (deterministic hash of eventType+aggregateId+payload)
          //   Layer 3 — concurrent processing guard via messageHash

          // Layer 1: check by caller-provided idempotency key FIRST.
          // If the caller passed the same idempotency key, it's the same logical operation — skip.
          if (event.callerIdempotencyKey) {
            const existingByKey = await tx.outboxEvent.findFirst({
              where: {
                callerIdempotencyKey: event.callerIdempotencyKey,
                status: { in: ['PROCESSED', 'COMPLETED'] },
              },
            });
            if (existingByKey) {
              // Same caller key + same logical operation = skip
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: { status: 'COMPLETED', processedAt: new Date() },
              });
              inc('outbox_duplicates_skipped_total');
              logger.info({ type: 'outbox_caller_key_skip', eventId: event.id, callerIdempotencyKey: event.callerIdempotencyKey });
              result.processed++;
              result.skippedDuplicate = (result.skippedDuplicate ?? 0) + 1;
              continue;
            }
          }

          // Compute hash AFTER caller-key check so hash computation only happens
          // for events that don't match the caller key.
          const messageHash = computeMessageHash(
            event.eventType,
            event.aggregateId,
            payload as Record<string, unknown>
          );

          // Layer 2: check by messageHash (crash-recovery path).
          // If another worker crashed after LINE success but before COMPLETED write,
          // that event is COMPLETED with the same messageHash. Skip this one.
          const existingCompleted = await tx.outboxEvent.findFirst({
            where: { messageHash, status: { in: ['PROCESSED', 'COMPLETED'] } },
          });
          if (existingCompleted) {
            // Already sent — just mark this one COMPLETED too (no re-send).
            // "COMPLETED" here means the LINE message WAS delivered.
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'COMPLETED', processedAt: new Date(), messageHash },
            });
            inc('outbox_duplicates_skipped_total');
            logger.info({ type: 'outbox_already_completed_skip', eventId: event.id, messageHash });
            result.processed++;
            continue;
          }

          // Layer 3: is another worker currently processing the same messageHash?
          // (messageHash collision or event retry). Skip to avoid duplicate sends.
          const concurrentProcessor = await tx.outboxEvent.findFirst({
            where: { messageHash, status: 'PROCESSING', id: { not: event.id } },
          });
          if (concurrentProcessor) {
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'COMPLETED', processedAt: new Date() },
            });
            inc('outbox_duplicates_skipped_total');
            logger.info({ type: 'outbox_concurrent_skip', eventId: event.id, messageHash });
            result.processed++;
            continue;
          }

          // 5d: Publish event (publish BEFORE marking processed)
          try {
            await this.eventBus.publish(event.eventType, event.aggregateType, event.aggregateId, payload);
            recordOutboxLatency(Date.now() - startMs);
            inc('outbox_sent_total');

            // ── Publish succeeded → NOW mark COMPLETED with messageHash ─────────
            // messageHash is set so crash-recovery knows this exact message was sent.
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: { status: 'COMPLETED', processedAt: new Date(), messageHash },
            });

            logger.debug({ type: 'outbox_event_processed', eventId: event.id, eventType: event.eventType });
            result.processed++;

          } catch (publishError) {
            // ── Publish failed → do NOT mark processed. Reset to PENDING for retry.
            const errMsg = publishError instanceof Error ? publishError.message : 'Unknown publish error';
            const errCode = toErrorCode(publishError);
            const nextRetry = event.retryCount + 1;
            const permanent = isPermanentError(publishError);
            const shouldDeadLetter = permanent || nextRetry >= this.options.deadLetterThreshold;
            // Hard enforcement: when retryCount hits deadLetterThreshold the event MUST
            // be dead-lettered regardless of error type. The condition above guarantees
            // this because shouldDeadLetter is true whenever nextRetry >= threshold.
            if (shouldDeadLetter) {
              await this.deadLetter(tx, event.id, `${permanent ? 'PERMANENT' : 'DEAD_LETTER'}: ${errMsg}`, errCode, result, event.aggregateType, event.aggregateId, event.eventType, nextRetry, payload, this.options.deadLetterThreshold, event.createdAt);
              result.errors.push({ eventId: event.id, error: errMsg });
            } else {
              const backoffMs = backoffWithJitter(nextRetry);
              await tx.outboxEvent.update({
                where: { id: event.id },
                data: {
                  status: 'PENDING',   // <— reset to PENDING so it will be retried
                  processingAt: null, // <— clear processing lock so next poll picks it up
                  retryCount: { increment: 1 },
                  lastError: errMsg,
                  errorCode: errCode,
                  lastFailedAt: new Date(),
                  nextRetryAt: new Date(Date.now() + backoffMs),
                },
              });

              await logAudit({
                actorId: 'SYSTEM', actorRole: 'SYSTEM', action: 'OUTBOX_EVENT_RETRY',
                entityType: event.aggregateType, entityId: event.aggregateId,
                metadata: { outboxEventId: event.id, eventType: event.eventType, retryCount: nextRetry, errorCode: errCode, lastError: errMsg },
              });

              logger.warn({
                type: 'outbox_publish_retry',
                eventId: event.id, eventType: event.eventType,
                retryCount: nextRetry, backoffMs, error: errMsg,
              });

              inc('outbox_failed_total');
              result.failed++;
              result.errors.push({ eventId: event.id, error: errMsg });
            }
          }
        }
      });
    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  private async deadLetter(
    tx: Prisma.TransactionClient,
    eventId: string,
    reason: string,
    errorCode: string,
    result: ProcessedResult,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    retryCount: number,
    payload: Record<string, unknown>,
    deadLetterThreshold: number,
    createdAt: Date,
  ): Promise<void> {
    await tx.outboxEvent.update({
      where: { id: eventId },
      data: { status: 'FAILED', lastError: reason, errorCode, lastFailedAt: new Date() },
    });

    // Payload snapshot — truncated to 500 chars to keep log lines manageable
    const payloadSnapshot = JSON.stringify(payload).slice(0, 500);
    const eventAgeHours = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000);
    const isPoisonMessage = retryCount >= deadLetterThreshold && reason.startsWith('PERMANENT');

    logger.error({
      type: 'outbox_dead_letter',
      eventId,
      aggregateType,
      aggregateId,
      eventType,
      errorCode,
      reason,
      retryCount,
      payloadSnapshot,
      eventAgeHours,
      isPoisonMessage,
    });

    inc('outbox_dead_letter_total');
    inc('outbox_failed_total');
    result.failed++;

    // Fire alerting — async, non-blocking so we don't slow the transaction
    alertOutboxDeadLetter(eventId, aggregateType, aggregateId, retryCount, errorCode).catch((e) => {
      logger.error({ type: 'alert_outbox_dead_letter_failed', eventId, error: e instanceof Error ? e.message : String(e) });
    });
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  async write(events: Array<{
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Json;
    deduplicationKey?: string;
  }>): Promise<void> {
    if (events.length === 0) return;

    // ── Backpressure: refuse new events when queue depth >= limit ──────────────
    const pending = await this.prisma.outboxEvent.count({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (pending >= MAX_PENDING_EVENTS) {
      throw Object.assign(new Error('Outbox queue full, throttling'), { code: 'OUTBOX_QUEUE_FULL' });
    }

    await this.prisma.$transaction(
      events.map((event) =>
        this.prisma.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
            status: 'PENDING',
            retryCount: 0,
            deduplicationKey: event.deduplicationKey ?? null,
          },
        })
      )
    );

    logger.debug({ type: 'outbox_events_written', count: events.length });
  }

  async writeOne(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Json,
    deduplicationKey?: string
  ): Promise<void> {
    await this.write([{ aggregateType, aggregateId, eventType, payload, deduplicationKey }]);
  }

  async cleanup(daysOld = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const r = await this.prisma.outboxEvent.deleteMany({
      where: { processedAt: { lt: cutoff } },
    });
    logger.info({ type: 'outbox_cleanup', deletedCount: r.count, daysOld });
    return r.count;
  }

  async getPendingCount(): Promise<number> {
    return this.prisma.outboxEvent.count({ where: { status: 'PENDING' } });
  }

  async getFailedCount(): Promise<number> {
    return this.prisma.outboxEvent.count({ where: { status: 'FAILED' } });
  }

  getStatus() {
    return {
      isProcessing: this.isProcessing,
      isRunning: this.intervalId !== null,
      options: this.options,
      currentBatchSize: this._currentBatchSize,
    };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let instance: OutboxProcessor | null = null;

export function getOutboxProcessor(eventBus?: EventBus, options?: OutboxProcessorOptions): OutboxProcessor {
  if (!instance) instance = new OutboxProcessor(eventBus, undefined, options);
  return instance;
}

export function createOutboxProcessor(options?: OutboxProcessorOptions): OutboxProcessor {
  return new OutboxProcessor(undefined, undefined, options);
}
