import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { createResetToken } from '@/lib/auth/session';
import { getEnv } from '@/lib/config/env';
import { getRequestIp, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

export const POST = asyncHandler(async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const userId = context?.params.id;
  if (!userId) {
    throw new NotFoundError('AdminUser');
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      isActive: true,
    },
  });

  if (!user) {
    throw new NotFoundError('AdminUser', userId);
  }

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId: user.id,
      usedAt: null,
    },
  });

  const { rawToken, tokenHash } = createResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const baseUrl = getEnv().APP_BASE_URL || new URL(req.url).origin;
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'ADMIN_RESET_LINK_ISSUED',
    entityType: 'AdminUser',
    entityId: user.id,
    metadata: {
      username: user.username,
      expiresAt,
    },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({
    success: true,
    data: {
      resetUrl,
      expiresAt,
    },
    message: 'Reset link generated successfully',
  } as ApiResponse<{ resetUrl: string; expiresAt: Date }>);
});

export const DELETE = asyncHandler(async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const userId = context?.params.id;
  if (!userId) {
    throw new NotFoundError('AdminUser');
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    select: { id: true, username: true },
  });

  if (!user) {
    throw new NotFoundError('AdminUser', userId);
  }

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId: user.id,
      usedAt: null,
    },
  });

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'ADMIN_RESET_LINK_REVOKED',
    entityType: 'AdminUser',
    entityId: user.id,
    metadata: {
      username: user.username,
    },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({
    success: true,
    data: null,
    message: 'Reset link revoked',
  } as ApiResponse<null>);
});
