import { NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getAllJobEntries, type JobEntry } from '@/modules/jobs/job-store';

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

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const response: JobsResponse = {
    jobs: getAllJobEntries(),
    workerAvailable: true,
  };

  return NextResponse.json({
    success: true,
    data: response,
  } as ApiResponse<JobsResponse>);
});
