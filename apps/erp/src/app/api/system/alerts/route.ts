import { NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { buildAlerts } from '@/lib/ops/alerts';

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const data = await buildAlerts();
  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
});
