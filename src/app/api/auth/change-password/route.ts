import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireAuthSession, getRequestIp } from '@/lib/auth/guards';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { setAuthCookies } from '@/lib/auth/session';
import { asyncHandler, ApiResponse, BadRequestError, UnauthorizedError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const windowMs = process.env.RATE_LIMIT_TEST === 'true' ? 60 * 1000 : 15 * 60 * 1000;
  const { allowed, remaining, resetAt } = await limiter.check(`change-password:${ip}`, 5, windowMs);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many password change attempts. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }

  const session = requireAuthSession(req);
  const body = changePasswordSchema.parse(await req.json());

  if (body.password !== body.confirmPassword) {
    throw new BadRequestError('Passwords do not match');
  }

  const user = await prisma.adminUser.findUnique({ where: { id: session.sub } });
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Account is unavailable');
  }

  if (!verifyPassword(body.currentPassword, user.passwordHash)) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  const updated = await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(body.password),
      forcePasswordChange: false,
    },
  });

  await logAudit({
    actorId: updated.id,
    actorRole: updated.role,
    action: 'PASSWORD_CHANGED',
    entityType: 'AdminUser',
    entityId: updated.id,
    metadata: {
      forcedFlow: session.forcePasswordChange,
    },
    ipAddress: getRequestIp(req),
  });

  const response = NextResponse.json({
    success: true,
    data: null,
    message: 'Password changed successfully',
  } as ApiResponse<null>);

  setAuthCookies(response, {
    sub: updated.id,
    username: updated.username,
    displayName: updated.displayName,
    role: updated.role,
    forcePasswordChange: false,
    buildingId: updated.buildingId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
  });

  return response;
});
