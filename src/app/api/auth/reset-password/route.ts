import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, ApiResponse, BadRequestError, UnauthorizedError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { hashResetToken, setAuthCookies } from '@/lib/auth/session';

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = resetSchema.parse(await req.json());
  if (body.password !== body.confirmPassword) {
    throw new BadRequestError('Passwords do not match');
  }

  const tokenHash = hashResetToken(body.token);
  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: true,
    },
  });

  if (!resetToken || !resetToken.user.isActive) {
    throw new UnauthorizedError('Reset token is invalid or expired');
  }

  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hashPassword(body.password), forcePasswordChange: false },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  const response = NextResponse.json({
    success: true,
    data: null,
    message: 'Password reset successfully',
  } as ApiResponse<null>);

  setAuthCookies(response, {
    sub: resetToken.user.id,
    username: resetToken.user.username,
    displayName: resetToken.user.displayName,
    role: resetToken.user.role,
    forcePasswordChange: false,
    buildingId: resetToken.user.buildingId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  });

  return response;
});
