import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { buildAlerts } from '@/lib/ops/alerts';
import { requireRole } from '@/lib/auth/guards';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  await await requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const data = await buildAlerts();
  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
});
