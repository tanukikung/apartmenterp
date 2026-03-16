import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { getRequestIp, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

const rejectSchema = z.object({
  reason: z.string().max(250).optional(),
});

export const POST = asyncHandler(async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const requestId = context?.params.id;
  if (!requestId) {
    throw new NotFoundError('StaffRegistrationRequest');
  }

  const registrationRequest = await prisma.staffRegistrationRequest.findUnique({
    where: { id: requestId },
  });

  if (!registrationRequest || registrationRequest.status !== 'PENDING') {
    throw new NotFoundError('StaffRegistrationRequest', requestId);
  }

  const body = rejectSchema.parse(await req.json().catch(() => ({})));

  await prisma.staffRegistrationRequest.update({
    where: { id: registrationRequest.id },
    data: {
      status: 'REJECTED',
      reviewedById: session.sub,
      reviewedAt: new Date(),
      rejectReason: body.reason?.trim() || null,
    },
  });

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'STAFF_REGISTRATION_REJECTED',
    entityType: 'StaffRegistrationRequest',
    entityId: registrationRequest.id,
    metadata: {
      username: registrationRequest.username,
      reason: body.reason?.trim() || null,
    },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({
    success: true,
    data: null,
    message: 'Staff registration rejected',
  } as ApiResponse<null>);
});
