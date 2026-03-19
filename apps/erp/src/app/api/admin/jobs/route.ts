import { NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Job registry (mirrors the static config in the system-jobs UI page).
// In production these statuses would come from a Redis/DB job store and
// workerAvailable would be derived from a worker heartbeat key in Redis.
// ---------------------------------------------------------------------------

interface JobEntry {
  id: string;
  status: 'idle' | 'running' | 'error';
  lastRun: string | null;
}

export interface JobsResponse {
  jobs: JobEntry[];
  /**
   * True only when a live background worker process is confirmed running.
   * The UI MUST disable "Run Now" actions when this is false and display a
   * clear informational notice rather than pretending execution is possible.
   *
   * Currently hardcoded false: no worker process is deployed in this
   * environment. Future: derive from Redis worker:heartbeat key.
   */
  workerAvailable: boolean;
}

const STATIC_JOB_STATUS: JobEntry[] = [
  { id: 'billing-generate', status: 'idle', lastRun: null },
  { id: 'invoice-send',     status: 'idle', lastRun: null },
  { id: 'overdue-flag',     status: 'idle', lastRun: null },
  { id: 'late-fee',         status: 'idle', lastRun: null },
  { id: 'db-cleanup',       status: 'idle', lastRun: null },
];

// ============================================================================
// GET /api/admin/jobs
// ============================================================================

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const response: JobsResponse = {
    jobs: STATIC_JOB_STATUS,
    // No worker deployed — always false until a worker process is running.
    workerAvailable: false,
  };

  return NextResponse.json({
    success: true,
    data: response,
  } as ApiResponse<JobsResponse>);
});
