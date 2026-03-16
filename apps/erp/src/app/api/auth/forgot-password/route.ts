import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { createResetToken } from '@/lib/auth/session';
import { getEnv } from '@/lib/config/env';
import { logAudit } from '@/modules/audit/audit.service';

const forgotSchema = z.object({
  usernameOrEmail: z.string().min(1),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { usernameOrEmail } = forgotSchema.parse(await req.json());
  const normalized = usernameOrEmail.trim().toLowerCase();

  const user = await prisma.adminUser.findFirst({
    where: {
      OR: [
        { username: { equals: normalized, mode: 'insensitive' } },
        { email: { equals: normalized, mode: 'insensitive' } },
      ],
    },
  });

  if (user && user.isActive) {
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
      actorId: user.id,
      actorRole: 'SELF_SERVICE',
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'AdminUser',
      entityId: user.id,
      metadata: {
        username: user.username,
        resetUrlPrepared: Boolean(resetUrl),
        expiresAt,
      },
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      submitted: true,
    },
    message: 'If the account exists, the reset request has been recorded. Contact an administrator to receive the reset link.',
  } as ApiResponse<{ submitted: boolean }>);
});
