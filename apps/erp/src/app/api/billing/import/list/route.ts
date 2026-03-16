import { NextRequest, NextResponse } from 'next/server';
import { getBillingService } from '@/modules/billing/billing.service';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
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
  };

  const billingService = getBillingService();
  const records = await billingService.listBillingRecords(query);

  return NextResponse.json({
    success: true,
    data: records,
  } as ApiResponse<typeof records>);
});
