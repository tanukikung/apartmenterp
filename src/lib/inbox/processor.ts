/**
 * InboxProcessor — zero-loss LINE event consumer
 *
 * Polling strategy (adaptive):
 *   - FAST mode (100 ms) while the backlog has work
 *   - SLOW mode (configurable, default 3 s) when the batch returned empty
 *   Avoids busy-looping when idle; reduces processing lag under burst.
 *
 * Retry schedule (exponential backoff + ±25 % jitter):
 *   attempt 1 →  ~2 s
 *   attempt 2 →  ~4 s
 *   attempt 3 →  ~8 s
 *   attempt 4 → ~16 s
 *   attempt 5 → DEAD  (visible at GET /api/admin/messaging/dlq)
 *
 * Crash recovery:
 *   On startup, rows stuck in PROCESSING (from a prior crash) are immediately
 *   reset to PENDING so they re-enter the work queue on the first poll.
 *
 * Idempotency:
 *   - DB unique(eventId): LINE retries are silent no-ops at ingest
 *   - Handler checks lineMessageId before writing Message rows (dedup)
 *   - PROCESSING→DONE transition is the idempotency sentinel; if a row is
 *     already DONE when the processor picks it up that cannot happen because
 *     DONE rows are never re-locked (query filters status = PENDING).
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import type { WebhookEvent } from '@line/bot-sdk';
import { processLineWebhookEvent } from '@/modules/line/event-handler';
import {
  inc,
  recordInboxLatency,
} from '@/lib/metrics/messaging';

// ── Error classification ──────────────────────────────────────────────────────

/** Derive a short machine-readable code from an error. */
function toErrorCode(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('429'))                             return 'LINE_RATE_LIMIT';
  if (/\b40[0-8]\b/.test(msg))                        return 'LINE_CLIENT_ERROR';
  if (/\b5\d{2}\b/.test(msg))                         return 'LINE_SERVER_ERROR';
  if (msg.includes('timeout') || msg.includes('etimedout')) return 'TIMEOUT';
  if (msg.includes('econnrefused') || msg.includes('econnreset')) return 'CONNECTION_ERROR';
  if (msg.includes('unique constraint'))               return 'DUPLICATE';
  return 'UNKNOWN';
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface InboxProcessorOptions {
  batchSize?:      number;
  maxRetries?:     number;
  pollIntervalMs?: number; // slow-mode interval
  fastPollMs?:     number; // fast-mode interval (when backlog exists)
  enabled?:        boolean;
}

const ENV_INT = (name: string, fallback: number): number => {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// ── Processor ─────────────────────────────────────────────────────────────────

export class InboxProcessor {
  private readonly batchSize:      number;
  private readonly maxRetries:     number;
  private readonly pollIntervalMs: number;
  private readonly fastPollMs:     number;
  private readonly enabled:        boolean;

  private isProcessing = false;
  private stopped      = false;
  private timeoutId:   NodeJS.Timeout | null = null;

  constructor(opts: InboxProcessorOptions = {}) {
    this.batchSize      = opts.batchSize      ?? ENV_INT('INBOX_BATCH_SIZE',        50);
    this.maxRetries     = opts.maxRetries     ?? ENV_INT('INBOX_MAX_RETRIES',        5);
    this.pollIntervalMs = opts.pollIntervalMs ?? ENV_INT('INBOX_POLL_INTERVAL_MS', 3_000);
    this.fastPollMs     = opts.fastPollMs     ?? ENV_INT('INBOX_FAST_POLL_MS',       100);
    this.enabled        = opts.enabled        ?? (process.env.INBOX_ENABLED ?? 'true') !== 'false';
  }

  // ── Startup: recover rows stuck in PROCESSING from a prior crash ──────────

  async recoverStale(): Promise<void> {
    try {
      const { count } = await prisma.inboxEvent.updateMany({
        where: { status: 'PROCESSING' },
        data:  { status: 'PENDING', nextRetryAt: null },
      });
      if (count > 0) {
        logger.warn(
          { type: 'inbox_stale_recovery', count },
          `Recovered ${count} stale PROCESSING inbox events`,
        );
      }
    } catch (err) {
      logger.error({ type: 'inbox_stale_recovery_error', error: (err as Error).message });
    }
  }

  start(): void {
    if (!this.enabled) { logger.info('InboxProcessor disabled'); return; }
    if (this.timeoutId || !this.stopped === false) {
      // Already running — idempotent
    }
    this.stopped = false;
    logger.info({
      type:       'inbox_processor_start',
      pollMs:     this.pollIntervalMs,
      fastPollMs: this.fastPollMs,
      batchSize:  this.batchSize,
      maxRetries: this.maxRetries,
    });

    void this.recoverStale();
    this.scheduleNext(true); // first poll immediately (fast mode)
  }

  stop(): void {
    this.stopped = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  // ── Adaptive scheduler ────────────────────────────────────────────────────
  // hadWork = true  →  reschedule at fastPollMs (backlog present)
  // hadWork = false →  reschedule at pollIntervalMs (idle)

  private scheduleNext(hadWork: boolean): void {
    if (this.stopped) return;
    const delay = hadWork ? this.fastPollMs : this.pollIntervalMs;
    this.timeoutId = setTimeout(() => {
      if (this.stopped || this.isProcessing) {
        this.scheduleNext(false);
        return;
      }
      this.isProcessing = true;
      void (async () => {
        let hadWork2 = false;
        try {
          const result = await this.processBatch();
          hadWork2 = result.processed + result.failed + result.dead > 0;
        } catch (err) {
          logger.error({ type: 'inbox_poll_error', error: (err as Error).message });
        } finally {
          this.isProcessing = false;
          this.scheduleNext(hadWork2);
        }
      })();
    }, delay);
  }

  // ── Core batch processor ──────────────────────────────────────────────────

  async processBatch(): Promise<{ processed: number; failed: number; dead: number }> {
    const result = { processed: 0, failed: 0, dead: 0 };

    // Lock a batch of PENDING rows (skip rows held by concurrent workers)
    const lockedIds = await prisma.$transaction(async (tx) => {
      type Row = { id: string };
      const rows = await (
        tx as unknown as { $queryRaw: (s: TemplateStringsArray, ...a: unknown[]) => Promise<Row[]> }
      ).$queryRaw`
        SELECT id FROM inbox_events
        WHERE  status = 'PENDING'
          AND  ("nextRetryAt" IS NULL OR "nextRetryAt" <= now())
        ORDER  BY "receivedAt" ASC
        LIMIT  ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return [];

      await tx.inboxEvent.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data:  { status: 'PROCESSING' },
      });
      return rows.map((r) => r.id);
    });

    if (lockedIds.length === 0) return result;

    inc('inbox_received_total', lockedIds.length);

    const events = await prisma.inboxEvent.findMany({
      where:   { id: { in: lockedIds } },
      orderBy: { receivedAt: 'asc' },
    });

    for (const inboxEvent of events) {
      const startMs = Date.now();
      try {
        const lineEvent = inboxEvent.payload as unknown as WebhookEvent;
        await processLineWebhookEvent(lineEvent, {
          webhookReceivedAt: inboxEvent.receivedAt.getTime(),
        });

        await prisma.inboxEvent.update({
          where: { id: inboxEvent.id },
          data:  {
            status:      'DONE',
            processedAt: new Date(),
            lastError:   null,
            errorCode:   null,
          },
        });

        const latencyMs = Date.now() - startMs;
        recordInboxLatency(latencyMs);
        inc('inbox_processed_total');

        logger.debug({ type: 'inbox_event_done', id: inboxEvent.id, latencyMs });

      } catch (err) {
        const errMsg   = err instanceof Error ? err.message : String(err);
        const errCode  = toErrorCode(err);
        const nextRetry = inboxEvent.retryCount + 1;

        if (nextRetry >= this.maxRetries) {
          await prisma.inboxEvent.update({
            where: { id: inboxEvent.id },
            data:  {
              status:       'DEAD',
              retryCount:   nextRetry,
              lastError:    errMsg,
              errorCode:    errCode,
              lastFailedAt: new Date(),
              processedAt:  new Date(),
            },
          });
          inc('inbox_dead_total');
          logger.error({
            type:       'inbox_event_dead',
            id:         inboxEvent.id,
            eventId:    inboxEvent.eventId,
            errorCode:  errCode,
            retryCount: nextRetry,
            error:      errMsg,
          });
          result.dead++;
        } else {
          // Exponential backoff with ±25 % jitter to spread retries
          const baseMs    = Math.pow(2, nextRetry) * 1_000;
          const jitterMs  = Math.floor(Math.random() * baseMs * 0.25);
          const backoffMs = baseMs + jitterMs;

          await prisma.inboxEvent.update({
            where: { id: inboxEvent.id },
            data:  {
              status:       'PENDING',
              retryCount:   nextRetry,
              nextRetryAt:  new Date(Date.now() + backoffMs),
              lastError:    errMsg,
              errorCode:    errCode,
              lastFailedAt: new Date(),
            },
          });
          inc('inbox_failed_total');
          logger.warn({
            type:       'inbox_event_retry',
            id:         inboxEvent.id,
            eventId:    inboxEvent.eventId,
            errorCode:  errCode,
            retryCount: nextRetry,
            backoffMs,
            error:      errMsg,
          });
          result.failed++;
        }
      }
    }

    if (result.processed > 0 || result.failed > 0 || result.dead > 0) {
      logger.info({ type: 'inbox_batch_complete', ...result });
    }

    return result;
  }

  // ── Observability ─────────────────────────────────────────────────────────

  async getPendingCount(): Promise<number> {
    return prisma.inboxEvent.count({ where: { status: 'PENDING' } });
  }

  async getDeadCount(): Promise<number> {
    return prisma.inboxEvent.count({ where: { status: 'DEAD' } });
  }

  getStatus(): { isRunning: boolean; isProcessing: boolean } {
    return { isRunning: this.timeoutId !== null, isProcessing: this.isProcessing };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let instance: InboxProcessor | null = null;

export function getInboxProcessor(opts?: InboxProcessorOptions): InboxProcessor {
  if (!instance) instance = new InboxProcessor(opts);
  return instance;
}
