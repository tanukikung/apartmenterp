import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedActor } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getMaintenanceService } from '@/modules/maintenance/maintenance.service';

const schema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE', 'CLOSED']),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);
  const actor = getVerifiedActor(req);

  const service = getMaintenanceService();
  const ticket = await service.updateStatus(
    {
      ticketId: input.ticketId,
      status: input.status,
    },
    actor.actorId
  );

  return NextResponse.json({
    success: true,
    data: ticket,
  } as ApiResponse<typeof ticket>);
});
