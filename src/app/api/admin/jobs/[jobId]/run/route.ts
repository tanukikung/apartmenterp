import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, NotFoundError } from '@/lib/utils/errors';
import { JOB_RUNNERS, isValidJobId } from '@/modules/jobs/job-runner';
import { setJobStatus, getJobEntry } from '@/modules/jobs/job-store';
import { requireRole } from '@/lib/auth/guards';
import { recordAlert } from '@/lib/metrics/alerts';

export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/admin/jobs/[jobId]/run
//
// Manually trigger a named background job. The job runs inline and returns
// when complete. The in-memory job store is updated with the result so that
// subsequent GET /api/admin/jobs shows accurate lastRun and status.
// ============================================================================

export const POST = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { jobId: string } },
  ): Promise<NextResponse> => {
    requireRole(req, ['ADMIN']);
    const { jobId } = params;

    if (!isValidJobId(jobId)) {
      throw new NotFoundError('Job', jobId);
    }

    // Prevent concurrent execution — return 409 if already running.
    if (getJobEntry(jobId)?.status === 'running') {
      return NextResponse.json({ success: false, error: 'Job is already running' }, { status: 409 });
    }

    // Mark as running
    setJobStatus(jobId, { status: 'running' });

    const startMs = Date.now();
    try {
      const result = await JOB_RUNNERS[jobId]();
      const durationMs = Date.now() - startMs;

      setJobStatus(jobId, {
        status: 'idle',
        lastRun: new Date().toISOString(),
        lastMessage: result.message,
        durationMs,
      });

      return NextResponse.json({
        success: true,
        data: {
          jobId,
          count: result.count,
          message: result.message,
          durationMs,
        },
      });
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const message = err instanceof Error ? err.message : 'Unknown error';

      setJobStatus(jobId, {
        status: 'error',
        lastRun: new Date().toISOString(),
        lastMessage: message,
        durationMs,
      });

      recordAlert(
        'critical',
        `job:${jobId}`,
        `Job "${jobId}" failed: ${message}`,
        { jobId, durationMs }
      );

      // Re-throw so asyncHandler wraps it in a proper error response
      throw err;
    }
  },
);
