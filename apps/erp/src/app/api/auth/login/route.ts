import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, ApiResponse, UnauthorizedError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { verifyPassword } from '@/lib/auth/password';
import { setAuthCookies } from '@/lib/auth/session';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = limiter.check(`login:${ip}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many login attempts. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }

  const contentType = req.headers.get('content-type') || '';
  const isForm = contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data');
  const rawBody = isForm ? Object.fromEntries((await req.formData()).entries()) : await req.json();
  const body = loginSchema.parse(rawBody);

  const user = await prisma.adminUser.findFirst({
    where: {
      OR: [
        { username: { equals: body.username, mode: 'insensitive' } },
        { email: { equals: body.username, mode: 'insensitive' } },
      ],
    },
  });

  if (!user || !user.isActive || !verifyPassword(body.password, user.passwordHash)) {
    if (isForm) {
      // 303 See Other forces the browser to GET the redirect target (Post/Redirect/Get).
      // Default 307 would re-POST, which Next.js 14 misidentifies as a URL-encoded
      // Server Action and crashes with "TypeError: Invalid URL" on origin: null.
      return NextResponse.redirect(new URL('/login?error=Invalid%20username%20or%20password', req.url), 303);
    }
    throw new UnauthorizedError('Invalid username or password');
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const redirectTo = user.forcePasswordChange ? '/change-password' : '/admin/dashboard';
  const res = isForm
    ? NextResponse.redirect(new URL(redirectTo, req.url), 303)
    : NextResponse.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        forcePasswordChange: user.forcePasswordChange,
      },
    },
  } as ApiResponse<{
    user: {
      id: string;
      username: string;
      displayName: string;
      role: typeof user.role;
      forcePasswordChange: boolean;
    };
  }>);

  setAuthCookies(res, {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    forcePasswordChange: user.forcePasswordChange,
    exp: expiresAt,
  });

  return res;
});
