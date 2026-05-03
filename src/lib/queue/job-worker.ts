/**
 * Background Job Worker
 *
 * Runs inside the Next.js instrumentation hook alongside the Outbox worker.
 * Polls `background_jobs` every JOB_POLL_INTERVAL_MS using FOR UPDATE SKIP LOCKED
 * so multiple app instances never double-process the same job.
 *
 * Adding a new job type:
 *   1. Add the type constant in types.ts
 *   2. Register the handler in JOB_HANDLERS below
 *   3. Enqueue via jobQueue.enqueueJob(JOB_TYPE.YOUR_TYPE, payload)
 */

import { logger } from '@/lib/utils/logger';
import { incrementCounter, observeHistogram } from '@/lib/metrics/registry';
import {
  claimAndMarkRunning,
  reclaimStuckJobs,
  markJobDone,
  markJobFailed,
  JOB_POLL_INTERVAL_MS,
  JOB_VISIBILITY_TIMEOUT_MS,
} from './job-queue';
import { JOB_TYPE } from './types';
import type { BankStatementImportPayload } from './types';

// ── Job handlers ──────────────────────────────────────────────────────────────

type JobHandler = (payload: unknown) => Promise<Record<string, unknown>>;

const JOB_HANDLERS: Record<string, JobHandler> = {

  [JOB_TYPE.BANK_STATEMENT_IMPORT]: async (rawPayload) => {
    const p = rawPayload as BankStatementImportPayload;
    const { getServiceContainer } = await import('@/lib/service-container');
    const service = getServiceContainer().paymentMatchingService;

    const entries = p.entries.map(e => ({
      date: new Date(e.date),
      time: e.time,
      amount: e.amount,
      description: e.description,
      reference: e.reference,
      roomNo: e.roomNo,
    }));

    const result = await service.importBankStatement(entries, p.sourceFile, {
      actorId: p.actorId,
      actorRole: p.actorRole,
    });

    return { imported: result.imported, matched: result.matched, sourceFile: p.sourceFile };
  },

  [JOB_TYPE.BILLING_GENERATE]: async (rawPayload) => {
    const p = rawPayload as { year: number; month: number; triggeredBy: string };
    const { JOB_RUNNERS } = await import('@/modules/jobs/job-runner');
    const runner = (JOB_RUNNERS as Record<string, () => Promise<{ count: number; message: string }>>)['billing-generate'];
    if (!runner) throw new Error('billing-generate runner not found');
    const result = await runner();
    return { count: result.count, message: result.message, year: p.year, month: p.month };
  },
};

// ── Worker loop ───────────────────────────────────────────────────────────────

let workerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

async function processBatch(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Reclaim jobs stuck in RUNNING (e.g. prior worker crashed mid-job)
    await reclaimStuckJobs(JOB_VISIBILITY_TIMEOUT_MS).catch((err) =>
      logger.error({ type: 'job_reclaim_error', error: err instanceof Error ? err.message : String(err) })
    );

    // Claim + mark RUNNING atomically — returns ONLY the rows this instance claimed.
    // Never re-fetches ALL RUNNING rows, which would cause two workers to
    // both execute each other's jobs in multi-instance deployments.
    const claimedJobs = await claimAndMarkRunning(5);
    if (claimedJobs.length === 0) return;

    for (const job of claimedJobs) {
      const startMs = Date.now();
      const handler = JOB_HANDLERS[job.type];

      if (!handler) {
        await markJobFailed(job.id, `No handler registered for job type: ${job.type}`, job.retryCount);
        continue;
      }

      try {
        const result = await handler(job.payload);
        await markJobDone(job.id, result);

        const durationSec = (Date.now() - startMs) / 1000;
        incrementCounter('background_jobs_completed_total', { type: job.type });
        observeHistogram('background_job_duration_seconds', durationSec, { type: job.type });

        logger.info({ type: 'job_completed', jobId: job.id, jobType: job.type, durationSec });

      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        await markJobFailed(job.id, error, job.retryCount);

        incrementCounter('background_jobs_failed_total', { type: job.type });
        logger.error({ type: 'job_failed', jobId: job.id, jobType: job.type, error, retryCount: job.retryCount });
      }
    }
  } catch (err) {
    logger.error({
      type: 'job_worker_error',
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the background job worker. Called from instrumentation.ts.
 * Safe to call multiple times — idempotent.
 */
export function startJobWorker(): void {
  if (workerInterval) return;
  workerInterval = setInterval(() => {
    void processBatch();
  }, JOB_POLL_INTERVAL_MS);

  // Process immediately on start
  void processBatch();

  logger.info({ type: 'job_worker_started', pollIntervalMs: JOB_POLL_INTERVAL_MS });
}

export function stopJobWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
