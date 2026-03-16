import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getMaintenanceService } from '@/modules/maintenance/maintenance.service';

const schema = z.object({
  ticketId: z.string().uuid(),
  authorId: z.string(),
  message: z.string().min(1),
  actorId: z.string().optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);

  const service = getMaintenanceService();
  const comment = await service.addComment(
    {
      ticketId: input.ticketId,
      authorId: input.authorId,
      message: input.message,
    },
    input.actorId || input.authorId
  );

  return NextResponse.json({
    success: true,
    data: comment,
  } as ApiResponse<typeof comment>, { status: 201 });
});

