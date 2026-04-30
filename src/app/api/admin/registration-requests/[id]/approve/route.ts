import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const POST = asyncHandler(async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`registration-approve:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
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

  const duplicateUser = await prisma.adminUser.findFirst({
    where: {
      OR: [
        { username: { equals: registrationRequest.username, mode: 'insensitive' } },
        ...(registrationRequest.email ? [{ email: { equals: registrationRequest.email, mode: 'insensitive' as const } }] : []),
      ],
    },
  });

  if (duplicateUser) {
    throw new ConflictError('A user with this username or email already exists');
  }

  const [user] = await prisma.$transaction([
    prisma.adminUser.create({
      data: {
        username: registrationRequest.username,
        email: registrationRequest.email,
        displayName: registrationRequest.displayName,
        passwordHash: registrationRequest.passwordHash,
        role: 'STAFF',
        forcePasswordChange: true,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        role: true,
        isActive: true,
        forcePasswordChange: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.staffRegistrationRequest.update({
      where: { id: registrationRequest.id },
      data: {
        status: 'APPROVED',
        reviewedById: session.sub,
        reviewedAt: new Date(),
        rejectReason: null,
      },
    }),
  ]);

  await logAudit({
    req,
    action: 'STAFF_REGISTRATION_APPROVED',
    entityType: 'StaffRegistrationRequest',
    entityId: registrationRequest.id,
    metadata: {
      username: registrationRequest.username,
      createdUserId: user.id,
    },
  });

  return NextResponse.json({
    success: true,
    data: user,
    message: 'Staff registration approved',
  } as ApiResponse<typeof user>);
});
