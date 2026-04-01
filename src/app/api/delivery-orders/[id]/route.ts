import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDeliveryService } from '@/modules/deliveries/delivery.service';

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireAuthSession(req);

  const service = getDeliveryService();
  const result = await service.getOrder(params.id);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
