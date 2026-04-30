import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { createResetToken } from '@/lib/auth/session';
import { getEnv } from '@/lib/config/env';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

export const POST = asyncHandler(async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`admin-reset-password:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
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
    req,
    action: 'ADMIN_RESET_LINK_ISSUED',
    entityType: 'AdminUser',
    entityId: user.id,
    metadata: {
      username: user.username,
      expiresAt,
    },
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
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`admin-reset-password-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
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
    req,
    action: 'ADMIN_RESET_LINK_REVOKED',
    entityType: 'AdminUser',
    entityId: user.id,
    metadata: {
      username: user.username,
    },
  });

  return NextResponse.json({
    success: true,
    data: null,
    message: 'Reset link revoked',
  } as ApiResponse<null>);
});
