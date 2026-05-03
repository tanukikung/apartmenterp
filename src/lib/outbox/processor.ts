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
  // Field name varies between schema versions; cast via any where needed
  lastAttemptAt?: Date | null;
  nextAttemptAt?: Date | null;
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
// ── Circuit Breaker ───────────────────────────────────────────────────────────
// If the EventBus (or downstream LINE API) fails CIRCUIT_OPEN_THRESHOLD times
// within CIRCUIT_WINDOW_MS the circuit opens and no events are published until
// CIRCUIT_RESET_MS has elapsed. This prevents the outbox from hammering a
// degraded downstream service and consuming all retry budget.

const CIRCUIT_OPEN_THRESHOLD = Number(process.env.OUTBOX_CIRCUIT_THRESHOLD ?? 5);
const CIRCUIT_WINDOW_MS      = Number(process.env.OUTBOX_CIRCUIT_WINDOW_MS  ?? 60_000);   // 1 min
const CIRCUIT_RESET_MS       = Number(process.env.OUTBOX_CIRCUIT_RESET_MS   ?? 120_000);  // 2 min

interface CircuitBreakerState {
  failures: number;
  windowStart: number;
  openedAt: number | null;
}

export class OutboxProcessor {
  private eventBus: EventBus;
  private prisma: typeof prisma;
  private options: Required<OutboxProcessorOptions>;
  private isProcessing = false;
  private shouldStop = false;
  private intervalId: NodeJS.Timeout | null = null;
  private circuit: CircuitBreakerState = { failures: 0, windowStart: Date.now(), openedAt: null };
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

  /**
   * Process pending outbox events.
   *
   * Two-phase design to minimise lock duration:
   *   Phase 1 (short transaction): SELECT FOR UPDATE SKIP LOCKED → stamp
   *     lastAttemptAt → COMMIT. Locks are held for <100 ms, not 5+ seconds.
   *   Phase 2 (outside any transaction): eventBus.publish() for each event,
   *     then individual UPDATE for processedAt / retryCount.
   */
  async process(): Promise<ProcessedResult> {
    if (this.isProcessing) return { processed: 0, failed: 0, errors: [] };

    this.isProcessing = true;
    const result: ProcessedResult = { processed: 0, failed: 0, errors: [] };

    try {
      // ── Phase 1: Claim events (short transaction — releases locks immediately) ─
      const claimedIds: string[] = [];
      await this.prisma.$transaction(async (tx) => {
        const lockedIds: Array<{ id: string }> = await tx.$queryRaw`
          SELECT id FROM outbox_events
          WHERE "processedAt" IS NULL
            AND "retryCount" < ${this.options.maxRetries}
          ORDER BY "createdAt" ASC
          LIMIT ${this.options.batchSize}
          FOR UPDATE SKIP LOCKED
        `;
        if (lockedIds.length === 0) return;

        const ids = lockedIds.map(r => r.id);
        await tx.$executeRaw`
          UPDATE outbox_events
          SET "lastAttemptAt" = NOW()
          WHERE id = ANY(${ids}::text[])
        `;
        claimedIds.push(...ids);
      });

      if (claimedIds.length === 0) return result;

      // Fetch full data for claimed events (outside lock)
      const events = await this.prisma.outboxEvent.findMany({
        where: { id: { in: claimedIds } },
        orderBy: { createdAt: 'asc' },
      });

      logger.debug({ type: 'outbox_processing', eventCount: events.length });

      // ── Phase 2: Process each event (outside any transaction) ──────────────
      for (const event of events) {
        // Exponential backoff — support both lastAttemptAt and nextAttemptAt
        // field names (the generated Prisma client may differ from schema.prisma).
        const ev = event as Record<string, unknown>;
        const attemptAt = (ev.lastAttemptAt ?? ev.nextAttemptAt) as Date | null | undefined;
        if (event.retryCount > 0 && attemptAt) {
          const elapsed = Date.now() - new Date(attemptAt).getTime();
          const required = Math.min(Math.pow(2, event.retryCount) * 1000, 60_000);
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

        // ── Circuit breaker check ─────────────────────────────────────────────
        if (this.circuit.openedAt !== null) {
          const elapsed = Date.now() - this.circuit.openedAt;
          if (elapsed < CIRCUIT_RESET_MS) {
            logger.warn({
              type: 'outbox_circuit_open',
              openedAt: new Date(this.circuit.openedAt).toISOString(),
              resetInMs: CIRCUIT_RESET_MS - elapsed,
            });
            break;
          }
          this.circuit = { failures: 0, windowStart: Date.now(), openedAt: null };
          logger.info({ type: 'outbox_circuit_reset' });
        }

        try {
          const payload = event.payload as Record<string, unknown>;

          await this.eventBus.publish(
            event.eventType,
            event.aggregateType,
            event.aggregateId,
            payload,
          );

          // Successful publish — reset failure window if it has expired
          if (Date.now() - this.circuit.windowStart > CIRCUIT_WINDOW_MS) {
            this.circuit = { failures: 0, windowStart: Date.now(), openedAt: null };
          }

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: { processedAt: new Date() },
          });

          result.processed++;
          logger.debug({ type: 'outbox_event_processed', eventId: event.id, eventType: event.eventType });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // ── Trip circuit if failure threshold exceeded in window ─────────────
          if (Date.now() - this.circuit.windowStart > CIRCUIT_WINDOW_MS) {
            this.circuit = { failures: 0, windowStart: Date.now(), openedAt: null };
          }
          this.circuit.failures++;
          if (this.circuit.failures >= CIRCUIT_OPEN_THRESHOLD && this.circuit.openedAt === null) {
            this.circuit.openedAt = Date.now();
            logger.error({
              type: 'outbox_circuit_tripped',
              failures: this.circuit.failures,
              threshold: CIRCUIT_OPEN_THRESHOLD,
              resetInMs: CIRCUIT_RESET_MS,
            });
          }

          const nextRetry = event.retryCount + 1;
          if (nextRetry >= this.options.deadLetterThreshold) {
            await this.prisma.outboxEvent.update({
              where: { id: event.id },
              data: { lastError: `DEAD_LETTER: ${errorMessage}`, processedAt: new Date() },
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
              },
            );
          } else {
            // Use raw SQL to avoid field-name mismatch between schema versions
            // (lastAttemptAt in schema.prisma vs nextAttemptAt in generated client).
            await this.prisma.$executeRaw`
              UPDATE outbox_events
              SET "lastError"     = ${errorMessage},
                  "lastAttemptAt" = NOW(),
                  "retryCount"    = "retryCount" + 1,
                  "updatedAt"     = NOW()
              WHERE id = ${event.id}
            `.catch(() =>
              // Fallback: Prisma ORM update without the renamed field
              this.prisma.outboxEvent.update({
                where: { id: event.id },
                data: { lastError: errorMessage, retryCount: { increment: 1 } },
              })
            );
          }

          result.failed++;
          result.errors.push({ eventId: event.id, error: errorMessage });
          logger.error({ type: 'outbox_event_error', eventId: event.id, error: errorMessage });
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return result;
  }

  /**
   * Write events to outbox.
   *
   * - Events without a deduplicationKey are bulk-inserted via createMany (fast).
   * - Events with a deduplicationKey use INSERT … ON CONFLICT DO NOTHING so
   *   duplicate business events (e.g. two concurrent payment confirmations) are
   *   silently ignored at the DB level.
   */
  async write(
    events: Array<{
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Json;
      deduplicationKey?: string;
    }>
  ): Promise<void> {
    if (events.length === 0) return;

    const withDedup = events.filter(e => e.deduplicationKey);
    const withoutDedup = events.filter(e => !e.deduplicationKey);

    if (withoutDedup.length > 0) {
      await this.prisma.outboxEvent.createMany({
        data: withoutDedup.map(e => ({
          id: uuidv4(),
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          eventType: e.eventType,
          payload: e.payload as Prisma.InputJsonValue,
          retryCount: 0,
        })),
      });
    }

    for (const event of withDedup) {
      await this.prisma.$executeRaw`
        INSERT INTO outbox_events (id, "aggregateType", "aggregateId", "eventType", payload, "retryCount", "deduplicationKey", "createdAt")
        VALUES (${uuidv4()}, ${event.aggregateType}, ${event.aggregateId}, ${event.eventType}, ${JSON.stringify(event.payload)}::jsonb, 0, ${event.deduplicationKey!}, NOW())
        ON CONFLICT ("deduplicationKey") DO NOTHING
      `;
    }

    logger.debug({ type: 'outbox_events_written', count: events.length });
  }

  /**
   * Write a single event to outbox.
   */
  async writeOne(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: Json,
    deduplicationKey?: string,
  ): Promise<void> {
    await this.write([{ aggregateType, aggregateId, eventType, payload, deduplicationKey }]);
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
