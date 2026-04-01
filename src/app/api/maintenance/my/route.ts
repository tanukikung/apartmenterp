import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getServiceContainer } from '@/lib/service-container';
import { requireAuthSession } from '@/lib/auth/guards';

const querySchema = z.object({
  tenantId: z.string().uuid(),
});

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  // Auth required; actorId not recorded for ticket queries.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _session = requireAuthSession(req);
  const url = new URL(req.url);

  // ADMIN/STAFF can view any tenant's tickets via query param.
  const tenantId: string = url.searchParams.get('tenantId') || '';

  const input = querySchema.parse({ tenantId });

  const { maintenanceService: service } = getServiceContainer();
  const tickets = await service.listTenantTickets(input.tenantId);

  return NextResponse.json({
    success: true,
    data: tickets,
  } as ApiResponse<typeof tickets>);
});

