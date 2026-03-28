import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getAllJobEntries, type JobEntry } from '@/modules/jobs/job-store';
import { getWorkerHeartbeat } from '@/infrastructure/redis';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export interface JobsResponse {
  jobs: JobEntry[];
  /**
   * True — jobs can always be run inline via the API.
   * The UI enables "Run Now" when this is true.
   */
  workerAvailable: boolean;
}

// ============================================================================
// GET /api/admin/jobs
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const heartbeat = await getWorkerHeartbeat();
  const workerAvailable = heartbeat !== null && (Date.now() - heartbeat) < 60_000;

  const response: JobsResponse = {
    jobs: getAllJobEntries(),
    workerAvailable,
  };

  return NextResponse.json({
    success: true,
    data: response,
  } as ApiResponse<JobsResponse>);
});
