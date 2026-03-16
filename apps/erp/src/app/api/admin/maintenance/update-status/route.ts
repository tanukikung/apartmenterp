import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getMaintenanceService } from '@/modules/maintenance/maintenance.service';

const schema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE', 'CLOSED']),
  actorId: z.string().optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);

  const service = getMaintenanceService();
  const ticket = await service.updateStatus(
    {
      ticketId: input.ticketId,
      status: input.status,
    },
    input.actorId || 'system'
  );

  return NextResponse.json({
    success: true,
    data: ticket,
  } as ApiResponse<typeof ticket>);
});

