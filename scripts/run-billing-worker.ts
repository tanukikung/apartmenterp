/**
 * Billing Worker — standalone process for queue-based invoice generation.
 *
 * Run: npx tsx scripts/run-billing-worker.ts
 * Or: npm run worker
 *
 * This process runs alongside Next.js in production.
 * It listens to the BullMQ billing-generation queue and processes jobs
 * with 5 concurrent workers.
 */

import { createBillingWorker } from '@/queues/billing.queue';
import { logger } from '@/lib/utils/logger';

async function main() {
  logger.info({ type: 'billing_worker_start' });

  const worker = createBillingWorker();

  worker.on('completed', (job) => {
    logger.info({
      type: 'billing_job_completed',
      jobId: job.id,
      roomBillingId: job.data.billingRecordId,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error({
      type: 'billing_job_failed',
      jobId: job?.id,
      error: err.message,
    });
  });

  worker.on('error', (err) => {
    logger.error({ type: 'billing_worker_error', error: err.message });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info({ type: 'billing_worker_shutdown' });
    await worker.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info({ type: 'billing_worker_ready', concurrency: 5 });
}

main().catch((err) => {
  logger.error({ type: 'billing_worker_fatal', error: err.message });
  process.exit(1);
});