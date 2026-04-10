import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError, BadRequestError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { z } from 'zod';

type Params = { params: { id: string } };

const updateRegistrationSchema = z.object({
  phone: z.string().optional(),
  claimedRoom: z.string().optional(),
  lineDisplayName: z.string().optional(),
  correctionNote: z.string().optional(),
  requestCorrection: z.boolean().optional(),
});

// ── PATCH /api/tenant-registrations/[id]  ─────────────────────────────────────
// Request-correction flow: admin sets status=CORRECTION_REQUESTED with a note,
// or updates phone / claimedRoom after the tenant re-submits.

export const PATCH = asyncHandler(async (req: NextRequest, context?: Params): Promise<NextResponse> => {
  const session = requireAuthSession(req);
  const id = context?.params.id;
  if (!id) throw new NotFoundError('TenantRegistration');

  const body = updateRegistrationSchema.parse(await req.json());

  const existing = await prisma.tenantRegistration.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('TenantRegistration', id);

  if (existing.status === 'APPROVED' || existing.status === 'REJECTED') {
    throw new BadRequestError('Cannot edit an approved or rejected registration');
  }

  const newStatus = body.requestCorrection ? 'CORRECTION_REQUESTED' : existing.status;

  const updated = await prisma.tenantRegistration.update({
    where: { id },
    data: {
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.claimedRoom !== undefined && { claimedRoom: body.claimedRoom }),
      ...(body.lineDisplayName !== undefined && { lineDisplayName: body.lineDisplayName }),
      ...(body.correctionNote !== undefined && { correctionNote: body.correctionNote }),
      status: newStatus,
      updatedAt: new Date(),
    },
  });

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: body.requestCorrection ? 'TENANT_REGISTRATION_CORRECTION_REQUESTED' : 'TENANT_REGISTRATION_UPDATED',
    entityType: 'TenantRegistration',
    entityId: id,
    metadata: { correctionNote: body.correctionNote, newStatus },
  });

  return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
});
