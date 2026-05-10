/**
 * Standalone worker process.
 *
 * Run: npx tsx scripts/run-billing-worker.ts
 * Or: npm run worker
 *
 * This process runs alongside Next.js in production. It always starts the
 * database-backed background job worker used by bank statement imports. When
 * Redis queue mode is configured, it also starts the BullMQ billing worker.
 */

import { createBillingWorker } from '@/queues/billing.queue';
import { startJobWorker, stopJobWorker } from '@/lib/queue/job-worker';
import { logger } from '@/lib/utils/logger';

async function main() {
  logger.info({ type: 'standalone_worker_start' });

  startJobWorker();

  const shouldRunBillingQueue =
    process.env.QUEUE_BILLING === 'true' || Boolean(process.env.REDIS_URL);
  const worker = shouldRunBillingQueue ? createBillingWorker() : null;

  if (!worker) {
    logger.info({
      type: 'billing_worker_skipped',
      reason: 'REDIS_URL is not configured; DB-backed background worker is running',
    });
  }

  worker?.on('completed', (job) => {
    logger.info({
      type: 'billing_job_completed',
      jobId: job.id,
      roomBillingId: job.data.billingRecordId,
    });
  });

  worker?.on('failed', (job, err) => {
    logger.error({
      type: 'billing_job_failed',
      jobId: job?.id,
      error: err.message,
    });
  });

  worker?.on('error', (err) => {
    logger.error({ type: 'billing_worker_error', error: err.message });
  });

  const shutdown = async () => {
    logger.info({ type: 'standalone_worker_shutdown' });
    stopJobWorker();
    await worker?.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info({
    type: 'standalone_worker_ready',
    dbBackedJobs: true,
    billingQueue: shouldRunBillingQueue,
  });
}

main().catch((err) => {
  logger.error({ type: 'standalone_worker_fatal', error: err.message });
  process.exit(1);
});
