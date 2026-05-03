/**
 * GET /api/payments/statement-upload/:jobId
 *
 * Poll the status of an async bank-statement import job.
 * Returns status PENDING | RUNNING | DONE | FAILED | DEAD and the result
 * payload once the job completes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getJobStatus } from '@/lib/queue/job-queue';

export const GET = asyncHandler(async (
  req: NextRequest,
  ctx: { params: { jobId: string } }
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const { jobId } = await ctx.params;

  const job = await getJobStatus(jobId);
  if (!job) {
    return NextResponse.json(
      { success: false, error: { message: 'Job not found', code: 'NOT_FOUND', statusCode: 404 } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      jobId: job.id,
      type: job.type,
      status: job.status,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    },
  });
});
