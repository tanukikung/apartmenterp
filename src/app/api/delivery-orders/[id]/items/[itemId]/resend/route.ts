import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDeliveryService } from '@/modules/deliveries/delivery.service';

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
): Promise<NextResponse> => {
  requireAuthSession(req);

  const service = getDeliveryService();
  const result = await service.resendItem(params.id, params.itemId);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
