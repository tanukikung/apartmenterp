import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedActor } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getServiceContainer } from '@/lib/service-container';

const schema = z.object({
  ticketId: z.string().uuid(),
  staffId: z.string(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);
  const actor = getVerifiedActor(req);

  const { maintenanceService: service } = getServiceContainer();
  const ticket = await service.assignStaff(
    {
      ticketId: input.ticketId,
      staffId: input.staffId,
    },
    actor.actorId
  );

  return NextResponse.json({
    success: true,
    data: ticket,
  } as ApiResponse<typeof ticket>);
});
