import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getServiceContainer } from '@/lib/service-container';
import { requireAuthSession } from '@/lib/auth/guards';

const querySchema = z.object({
  tenantId: z.string().uuid(),
});

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireAuthSession(req);
  const url = new URL(req.url);

  // ADMIN/STAFF can view any tenant's tickets via query param.
  // TENANT role must use their own tenantId from session.
  let tenantId: string;
  if (session.role === 'TENANT') {
    tenantId = session.tenantId!;
  } else {
    tenantId = url.searchParams.get('tenantId') || session.tenantId || '';
  }

  const input = querySchema.parse({ tenantId });

  const { maintenanceService: service } = getServiceContainer();
  const tickets = await service.listTenantTickets(input.tenantId);

  return NextResponse.json({
    success: true,
    data: tickets,
  } as ApiResponse<typeof tickets>);
});

