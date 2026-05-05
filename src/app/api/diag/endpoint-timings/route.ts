import { NextResponse } from 'next/server';
import { GET_DIAG_ENDPOINT_TIMINGS } from '@/lib/diagnostics/performance';
import { asyncHandler } from '@/lib/utils/errors';

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  return GET_DIAG_ENDPOINT_TIMINGS();
});