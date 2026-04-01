import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDeliveryService } from '@/modules/deliveries/delivery.service';
import { deliveryOrderListQuerySchema, createDeliveryOrderSchema } from '@/modules/deliveries/types';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
  const url = new URL(req.url);
  const query = deliveryOrderListQuerySchema.parse({
    year: url.searchParams.get('year') ?? undefined,
    month: url.searchParams.get('month') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
  });

  const service = getDeliveryService();
  const result = await service.listOrders(query);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireAuthSession(req);
  const body = await req.json();
  const input = createDeliveryOrderSchema.parse(body);

  const service = getDeliveryService();
  const result = await service.createOrder(input, session.sub);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
