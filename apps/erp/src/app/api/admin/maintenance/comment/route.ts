import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedActor } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getMaintenanceService } from '@/modules/maintenance/maintenance.service';

const schema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().min(1),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);
  const actor = getVerifiedActor(req);

  const service = getMaintenanceService();
  const comment = await service.addComment(
    {
      ticketId: input.ticketId,
      authorId: actor.actorId,
      message: input.message,
    },
    actor.actorId
  );

  return NextResponse.json({
    success: true,
    data: comment,
  } as ApiResponse<typeof comment>, { status: 201 });
});
