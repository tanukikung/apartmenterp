import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError, BadRequestError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

const rejectSchema = z.object({
  reason: z.string().max(250).optional(),
});

type Params = { params: { id: string } };

// ── POST /api/tenant-registrations/[id]/reject ────────────────────────────────

export const POST = asyncHandler(async (req: NextRequest, context?: Params): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const id = context?.params.id;
  if (!id) throw new NotFoundError('TenantRegistration');

  const body = rejectSchema.parse(await req.json());

  const reg = await prisma.tenantRegistration.findUnique({ where: { id } });
  if (!reg) throw new NotFoundError('TenantRegistration', id);

  if (reg.status === 'APPROVED' || reg.status === 'REJECTED') {
    throw new BadRequestError(`Registration is already ${reg.status.toLowerCase()}`);
  }

  const rejected = await prisma.tenantRegistration.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectionReason: body.reason?.trim() || null,
      reviewedById: session.sub,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'TENANT_REGISTRATION_REJECTED',
    entityType: 'TenantRegistration',
    entityId: id,
    metadata: { reason: body.reason },
  });

  return NextResponse.json({
    success: true,
    data: rejected,
    message: 'Registration rejected',
  } as ApiResponse<typeof rejected>);
});
