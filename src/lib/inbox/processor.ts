/**
 * InboxProcessor
 *
 * Polls the `inbox_events` table for PENDING rows and processes each one.
 * Guarantees at-least-once delivery with idempotency enforced at the event
 * level (lineMessageId unique constraint, upsert on InboxEvent.eventId).
 *
 * Retry schedule (exponential backoff):
 *   retry 1 →  2 s
 *   retry 2 →  4 s
 *   retry 3 →  8 s
 *   retry 4 → 16 s
 *   retry 5 → DEAD (visible in /api/admin/health/messaging)
 *
 * Stale-PROCESSING recovery:
 *   On startup, any rows stuck in PROCESSING (from a previous crash) are
 *   reset to PENDING so they are retried on the next poll cycle.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import type { WebhookEvent } from '@line/bot-sdk';
import { processLineWebhookEvent } from '@/modules/line/event-handler';

export interface InboxProcessorOptions {
  batchSize?: number;
  maxRetries?: number;
  pollIntervalMs?: number;
  enabled?: boolean;
}

const ENV_INT = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export class InboxProcessor {
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly pollIntervalMs: number;
  private readonly enabled: boolean;

  private isProcessing = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(opts: InboxProcessorOptions = {}) {
    this.batchSize     = opts.batchSize     ?? ENV_INT('INBOX_BATCH_SIZE', 50);
    this.maxRetries    = opts.maxRetries    ?? ENV_INT('INBOX_MAX_RETRIES', 5);
    this.pollIntervalMs = opts.pollIntervalMs ?? ENV_INT('INBOX_POLL_INTERVAL_MS', 2000);
    this.enabled       = opts.enabled       ?? (process.env.INBOX_ENABLED ?? 'true') !== 'false';
  }

  // ── Startup: recover stale PROCESSING rows ────────────────────────────────
  async recoverStale(): Promise<void> {
    try {
      const { count } = await prisma.inboxEvent.updateMany({
        where: { status: 'PROCESSING' },
        data: { status: 'PENDING', nextRetryAt: null },
      });
      if (count > 0) {
        logger.warn({ type: 'inbox_stale_recovery', count }, `Recovered ${count} stale PROCESSING inbox events`);
      }
    } catch (err) {
      logger.error({ type: 'inbox_stale_recovery_error', error: (err as Error).message });
    }
  }

  start(): void {
    if (!this.enabled) {
      logger.info('InboxProcessor disabled');
      return;
    }
    if (this.intervalId) {
      logger.warn('InboxProcessor already running');
      return;
    }

    logger.info({ type: 'inbox_processor_start', pollIntervalMs: this.pollIntervalMs, batchSize: this.batchSize });

    void this.recoverStale();

    // First poll immediately, then on interval
    void this.poll();
    this.intervalId = setInterval(() => { void this.poll(); }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      await this.processBatch();
    } catch (err) {
      logger.error({ type: 'inbox_poll_error', error: (err as Error).message });
    } finally {
      this.isProcessing = false;
    }
  }

  async processBatch(): Promise<{ processed: number; failed: number; dead: number }> {
    const result = { processed: 0, failed: 0, dead: 0 };

    // Lock a batch of PENDING rows (skipping any locked by concurrent workers)
    const lockedIds = await prisma.$transaction(async (tx) => {
      type Row = { id: string };
      const rows = await (tx as unknown as { $queryRaw: (s: TemplateStringsArray, ...a: unknown[]) => Promise<Row[]> })
        .$queryRaw`
          SELECT id FROM inbox_events
          WHERE status = 'PENDING'
            AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now())
          ORDER BY "receivedAt" ASC
          LIMIT ${this.batchSize}
          FOR UPDATE SKIP LOCKED
        `;
      if (rows.length === 0) return [];

      // Mark PROCESSING atomically inside the same transaction as the lock
      await tx.inboxEvent.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { status: 'PROCESSING' },
      });
      return rows.map((r) => r.id);
    });

    if (lockedIds.length === 0) return result;

    // Fetch full payloads outside the lock transaction (read-only)
    const events = await prisma.inboxEvent.findMany({
      where: { id: { in: lockedIds } },
      orderBy: { receivedAt: 'asc' },
    });

    for (const inboxEvent of events) {
      try {
        const lineEvent = inboxEvent.payload as unknown as WebhookEvent;
        await processLineWebhookEvent(lineEvent, {
          webhookReceivedAt: inboxEvent.receivedAt.getTime(),
        });

        await prisma.inboxEvent.update({
          where: { id: inboxEvent.id },
          data: { status: 'DONE', processedAt: new Date(), lastError: null },
        });
        result.processed++;

        logger.debug({ type: 'inbox_event_done', id: inboxEvent.id });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const nextRetry = inboxEvent.retryCount + 1;

        if (nextRetry >= this.maxRetries) {
          await prisma.inboxEvent.update({
            where: { id: inboxEvent.id },
            data: {
              status: 'DEAD',
              retryCount: nextRetry,
              lastError: errMsg,
              processedAt: new Date(),
            },
          });
          logger.error({
            type: 'inbox_event_dead',
            id: inboxEvent.id,
            retryCount: nextRetry,
            error: errMsg,
          });
          result.dead++;
        } else {
          const backoffMs = Math.pow(2, nextRetry) * 1_000;
          await prisma.inboxEvent.update({
            where: { id: inboxEvent.id },
            data: {
              status: 'PENDING',
              retryCount: nextRetry,
              nextRetryAt: new Date(Date.now() + backoffMs),
              lastError: errMsg,
            },
          });
          logger.warn({
            type: 'inbox_event_retry',
            id: inboxEvent.id,
            retryCount: nextRetry,
            backoffMs,
            error: errMsg,
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
    return { isRunning: this.intervalId !== null, isProcessing: this.isProcessing };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let instance: InboxProcessor | null = null;

export function getInboxProcessor(opts?: InboxProcessorOptions): InboxProcessor {
  if (!instance) instance = new InboxProcessor(opts);
  return instance;
}
