import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId');
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  const query = {
    ...(roomId && { roomId }),
    ...(year && { year: parseInt(year, 10) }),
    ...(month && { month: parseInt(month, 10) }),
    page: 1,
    pageSize: 100,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
  };

  const { billingService } = getServiceContainer();
  const records = await billingService.listBillingRecords(query);

  return NextResponse.json({
    success: true,
    data: records,
  } as ApiResponse<typeof records>);
});
