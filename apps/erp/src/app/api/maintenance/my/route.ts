import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getServiceContainer } from '@/lib/service-container';

const querySchema = z.object({
  tenantId: z.string().uuid(),
});

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId') || '';
  const input = querySchema.parse({ tenantId });

  const { maintenanceService: service } = getServiceContainer();
  const tickets = await service.listTenantTickets(input.tenantId);

  return NextResponse.json({
    success: true,
    data: tickets,
  } as ApiResponse<typeof tickets>);
});

