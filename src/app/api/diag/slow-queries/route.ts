import { NextResponse } from 'next/server';
import { GET_DIAG_SLOW_QUERIES } from '@/lib/diagnostics/performance';
import { asyncHandler } from '@/lib/utils/errors';

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  return GET_DIAG_SLOW_QUERIES();
});