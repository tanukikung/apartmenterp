import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, NotFoundError } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// POST /api/admin/jobs/[jobId]/run
//
// Manually trigger a named background job.
//
// Returns:
//   200 – job was dispatched to the live worker queue (future)
//   404 – unknown jobId
//   503 – worker is not available; the UI must NOT pretend the job ran
//
// Currently always returns 503 because no background worker is deployed.
// When a worker is added, replace the 503 block with real job dispatch logic.
// ---------------------------------------------------------------------------

const VALID_JOB_IDS = new Set([
  'billing-generate',
  'invoice-send',
  'overdue-flag',
  'late-fee',
  'db-cleanup',
]);

export const POST = asyncHandler(
  async (
    _req: NextRequest,
    { params }: { params: { jobId: string } },
  ): Promise<NextResponse> => {
    const { jobId } = params;

    if (!VALID_JOB_IDS.has(jobId)) {
      throw new NotFoundError('Job', jobId);
    }

    // No worker process deployed — return 503 so the UI shows an honest error
    // instead of a fake "job started" success message.
    // TODO: When a worker is deployed, check its heartbeat here and dispatch.
    return NextResponse.json(
      {
        success: false,
        error: {
          name: 'ServiceUnavailable',
          message:
            'Background worker is not running. Jobs execute automatically on their configured schedule when the worker is deployed. Manual triggering requires a running worker process.',
          code: 'WORKER_UNAVAILABLE',
          statusCode: 503,
        },
      },
      { status: 503 },
    );
  },
);
