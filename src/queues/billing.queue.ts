/**
 * BullMQ Billing Queue — durable background invoice generation.
 *
 * Worker process: npm run worker
 * In inline mode (default): jobs are processed synchronously via setImmediate.
 * In queue mode (QUEUE_BILLING=true): jobs are persisted to Redis and a
 * separate worker (npm run worker) handles them asynchronously.
 *
 * All Redis keys use apt: namespace prefix to prevent collision.
 * Job events are fully logged for observability.
 */

import { Queue as BullQueue, Worker as BullWorker } from 'bullmq';
import { getServiceContainer } from '@/lib/service-container';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

const QUEUE_NAME = 'apt:billing-generation';

export interface BillingJobData {
  billingRecordId: string;
  periodId: string;
}

export interface BillingJobResult {
  invoiceId: string;
  roomNo: string;
  status: string;
}

interface RedisConnectionOptions {
  url: string;
  maxRetriesPerRequest: null;
}

/** Parse REDIS_URL into connection options for BullMQ */
function getRedisConnection(): RedisConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is required for BullMQ queue');
  return { url, maxRetriesPerRequest: null };
}

/** Lazy-initialized queue instance */
function createQueue(): BullQueue {
  return new BullQueue(QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _queue: BullQueue<any, any, any> | null = null;
function getQueue(): BullQueue {
  if (!_queue) _queue = createQueue();
  return _queue;
}

/**
 * Enqueue invoice generation for a RoomBilling record.
 * Job is idempotent — duplicate jobId ensures only one job processes a given billing record.
 */
export async function enqueueBillingJob(billingRecordId: string, periodId: string): Promise<void> {
  const queue = getQueue();
  const jobId = `billing:${billingRecordId}`;

  logger.info({
    type: 'queue_job_enqueued',
    requestId: null,
    jobId,
    billingRecordId,
    periodId,
  });

  await queue.add(
    'generate-invoice',
    { billingRecordId, periodId } as BillingJobData,
    { jobId }
  );
}

/**
 * Enqueue all RoomBilling records for a period.
 * Returns the number of jobs enqueued.
 */
export async function enqueueAllBillingJobs(periodId: string): Promise<number> {
  const billings = await prisma.roomBilling.findMany({
    where: { billingPeriodId: periodId },
    select: { id: true },
  });

  const queue = getQueue();
  const jobs = billings.map((b) => ({
    name: 'generate-invoice',
    data: { billingRecordId: b.id, periodId } as BillingJobData,
    opts: { jobId: `billing:${b.id}` },
  }));

  logger.info({
    type: 'queue_bulk_enqueue',
    requestId: null,
    periodId,
    count: jobs.length,
  });

  await queue.addBulk(jobs);
  return billings.length;
}

/**
 * Process a single billing job — called by the worker or inline.
 * Job is idempotent: if invoice already exists, returns existing record.
 */
export async function processBillingJob(data: BillingJobData): Promise<BillingJobResult> {
  const { billingRecordId } = data;
  const startTime = Date.now();

  const billing = await prisma.roomBilling.findUnique({
    where: { id: billingRecordId },
    include: { room: true },
  });

  if (!billing) {
    logger.error({
      type: 'queue_job_not_found',
      billingRecordId,
      error: `RoomBilling ${billingRecordId} not found`,
    });
    throw new Error(`RoomBilling ${billingRecordId} not found`);
  }

  const existing = await prisma.invoice.findUnique({ where: { roomBillingId: billingRecordId } });
  if (existing) {
    logger.info({
      type: 'queue_job_skipped',
      requestId: null,
      jobId: `billing:${billingRecordId}`,
      billingRecordId,
      invoiceId: existing.id,
      reason: 'invoice_already_exists',
      durationMs: Date.now() - startTime,
    });
    return { invoiceId: existing.id, roomNo: billing.roomNo, status: existing.status };
  }

  const { invoiceService } = getServiceContainer();
  const invoice = await invoiceService.generateInvoice({ billingRecordId });

  logger.info({
    type: 'queue_job_completed',
    requestId: null,
    jobId: `billing:${billingRecordId}`,
    billingRecordId,
    invoiceId: invoice.id,
    roomNo: billing.roomNo,
    durationMs: Date.now() - startTime,
  });

  return { invoiceId: invoice.id, roomNo: billing.roomNo, status: invoice.status };
}

/** Create and start the billing worker — call in worker process only */
export function createBillingWorker(): BullWorker {
  const conn = getRedisConnection();
  const worker = new BullWorker(
    QUEUE_NAME,
    async (job) => {
      const result = await processBillingJob(job.data as BillingJobData);
      await job.updateProgress(100);
      return result;
    },
    {
      connection: conn,
      concurrency: 5,
    }
  );

  // Structured event listeners for observability
  worker.on('completed', (job) => {
    logger.info({
      type: 'queue_worker_completed',
      requestId: null,
      jobId: job.id,
      jobName: job.name,
      billingRecordId: job.data.billingRecordId,
      attempts: job.attemptsMade,
      durationMs: job.finishedOn ? job.finishedOn - job.timestamp : null,
    });
  });

  worker.on('failed', (job, err) => {
    logger.error({
      type: 'queue_worker_failed',
      requestId: null,
      jobId: job?.id ?? 'unknown',
      jobName: job?.name ?? 'unknown',
      billingRecordId: job?.data?.billingRecordId ?? null,
      attempts: job?.attemptsMade ?? 0,
      error: err.message,
      stack: err.stack,
    });
  });

  worker.on('error', (err) => {
    logger.error({
      type: 'queue_worker_error',
      requestId: null,
      error: err.message,
      stack: err.stack,
    });
  });

  return worker;
}