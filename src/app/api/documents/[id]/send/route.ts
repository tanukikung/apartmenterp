import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDeliveryService } from '@/modules/deliveries/delivery.service';

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);

  const service = getDeliveryService();
  const result = await service.sendSingleDocument(params.id, session.sub);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
