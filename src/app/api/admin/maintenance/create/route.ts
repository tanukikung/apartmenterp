import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  roomId: z.string().min(1),
  tenantId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const input = createSchema.parse(await req.json());

  const { maintenanceService: service } = getServiceContainer();

  const actor = { actorId: 'admin', actorRole: 'ADMIN' };

  const ticket = await service.createTicket(
    {
      roomId: input.roomId,
      tenantId: input.tenantId ?? '00000000-0000-0000-0000-000000000000',
      title: input.title,
      description: input.description,
      priority: input.priority,
    },
    actor
  );

  return NextResponse.json({
    success: true,
    data: ticket,
  } as ApiResponse<typeof ticket>, { status: 201 });
});
