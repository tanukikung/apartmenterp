/**
 * Background Job Queue
 *
 * Thin wrapper over the `background_jobs` PostgreSQL table.
 * Uses SELECT … FOR UPDATE SKIP LOCKED so multiple app instances
 * (e.g. blue-green, horizontal scale-out) never process the same job twice.
 *
 * Enqueue a job:
 *   await jobQueue.enqueue(JOB_TYPE.BANK_STATEMENT_IMPORT, payload);
 *
 * The worker (`job-worker.ts`) polls this table every 2 s and executes
 * pending jobs. The API layer returns immediately after enqueue with the
 * job ID so the client can poll for progress.
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import type { JobType } from './types';

export const JOB_POLL_INTERVAL_MS =
  Number(process.env.JOB_POLL_INTERVAL_MS ?? 2_000);

export const JOB_MAX_RETRIES =
  Number(process.env.JOB_MAX_RETRIES ?? 3);

export const JOB_VISIBILITY_TIMEOUT_MS =
  Number(process.env.JOB_VISIBILITY_TIMEOUT_MS ?? 600_000);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a background job. Returns the job ID immediately.
 * The job will be picked up by the worker within JOB_POLL_INTERVAL_MS.
 *
 * When `idempotencyKey` is provided, uses INSERT … ON CONFLICT DO NOTHING
 * so duplicate enqueues for the same key are silently ignored and the
 * existing job ID is returned instead of creating a second job.
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { scheduledAt?: Date; priority?: number; idempotencyKey?: string } = {},
): Promise<string> {
  if (opts.idempotencyKey) {
    const id = uuidv4();
    const scheduledAt = opts.scheduledAt ?? new Date();
    const priority = opts.priority ?? 0;
    const key = opts.idempotencyKey;

    await prisma.$executeRaw`
      INSERT INTO background_jobs (id, type, payload, status, "retryCount", "scheduledAt", priority, "idempotencyKey", "createdAt", "updatedAt")
      VALUES (${id}, ${type}, ${JSON.stringify(payload)}::jsonb, 'PENDING', 0, ${scheduledAt}, ${priority}, ${key}, NOW(), NOW())
      ON CONFLICT ("idempotencyKey") DO NOTHING
    `;

    // Return existing job id if insert was suppressed
    const existing = await (prisma as any).backgroundJob.findFirst({
      where: { idempotencyKey: key },
      select: { id: true },
    });
    const resolvedId = existing?.id ?? id;
    logger.info({ type: 'job_enqueued', jobId: resolvedId, jobType: type, idempotencyKey: key });
    return resolvedId;
  }

  const id = uuidv4();
  await (prisma as any).backgroundJob.create({
    data: {
      id,
      type,
      payload,
      status: 'PENDING',
      retryCount: 0,
      scheduledAt: opts.scheduledAt ?? new Date(),
      priority: opts.priority ?? 0,
    },
  });
  logger.info({ type: 'job_enqueued', jobId: id, jobType: type });
  return id;
}

/**
 * Fetch current status + result for a job.
 */
export async function getJobStatus(jobId: string): Promise<{
  id: string;
  type: string;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
} | null> {
  return (prisma as any).backgroundJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      type: true,
      status: true,
      result: true,
      error: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
    },
  });
}

/**
 * Claim the next batch of PENDING jobs AND mark them RUNNING in a single atomic
 * UPDATE … RETURNING statement. Callers receive only the rows this instance
 * claimed — never the full set of RUNNING rows — eliminating the race condition
 * where two workers could both process the same job.
 */
export async function claimAndMarkRunning(
  batchSize = 5,
): Promise<Array<{ id: string; type: string; payload: unknown; retryCount: number }>> {
  type JobRow = { id: string; type: string; payload: unknown; retryCount: number };
  let claimed: JobRow[] = [];
  await prisma.$transaction(async (tx) => {
    claimed = await (tx as any).$queryRaw<JobRow[]>`
      UPDATE background_jobs
      SET status = 'RUNNING', "startedAt" = NOW(), "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM background_jobs
        WHERE status = 'PENDING'
          AND "scheduledAt" <= NOW()
          AND "retryCount" < ${JOB_MAX_RETRIES}
        ORDER BY priority DESC, "scheduledAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, "retryCount"
    `;
  });
  return claimed;
}

/**
 * Reset RUNNING jobs whose startedAt is older than visibilityTimeoutMs back to
 * PENDING so they can be re-claimed. Handles workers that crashed mid-job.
 */
export async function reclaimStuckJobs(
  visibilityTimeoutMs = JOB_VISIBILITY_TIMEOUT_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - visibilityTimeoutMs);
  const rawResult = await prisma.$executeRaw`
    UPDATE background_jobs
    SET status = 'PENDING',
        "scheduledAt" = NOW(),
        "updatedAt" = NOW(),
        error = COALESCE(error, '') || ' [reclaimed from stuck RUNNING]'
    WHERE status = 'RUNNING'
      AND "startedAt" < ${cutoff}
  `;
  // PostgreSQL $executeRaw returns BigInt (rows affected). Convert to Number
  // before passing to pino — pino cannot JSON-serialize BigInt and throws,
  // silently swallowing the entire log line including the reclaimed count.
  const count = Number(rawResult);
  if (count > 0) {
    logger.warn({ type: 'job_reclaimed_stuck', count, visibilityTimeoutMs });
  }
  return count;
}

/**
 * Mark a job as DONE with its result payload.
 */
export async function markJobDone(jobId: string, result: Record<string, unknown>): Promise<void> {
  await (prisma as any).backgroundJob.update({
    where: { id: jobId },
    data: { status: 'DONE', result, finishedAt: new Date() },
  });
}

/**
 * Increment retryCount and re-queue (status=PENDING) with exponential backoff,
 * or mark as DEAD when max retries exhausted.
 */
export async function markJobFailed(jobId: string, error: string, retryCount: number): Promise<void> {
  const nextRetry = retryCount + 1;
  const isDead = nextRetry >= JOB_MAX_RETRIES;
  const backoffMs = Math.min(Math.pow(2, nextRetry) * 5_000, 300_000); // 10s, 20s, 40s … cap 5min
  await (prisma as any).backgroundJob.update({
    where: { id: jobId },
    data: {
      status: isDead ? 'DEAD' : 'PENDING',
      error,
      retryCount: nextRetry,
      scheduledAt: isDead ? undefined : new Date(Date.now() + backoffMs),
      finishedAt: isDead ? new Date() : undefined,
    },
  });
  if (isDead) {
    logger.error({ type: 'job_dead', jobId, error, retryCount: nextRetry });
  }
}
