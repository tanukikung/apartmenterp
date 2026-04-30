import { NextRequest, NextResponse } from 'next/server';
import { AdminRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

const updateUserSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  role: z.nativeEnum(AdminRole).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(128).optional().or(z.literal('')),
});

export const PATCH = asyncHandler(async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`admin-users-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['OWNER', 'ADMIN']);
  const userId = context?.params.id;
  if (!userId) {
    throw new NotFoundError('AdminUser');
  }

  const body = updateUserSchema.parse(await req.json());
  const existing = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!existing) {
    throw new NotFoundError('AdminUser', userId);
  }

  if (existing.id === session.sub && body.isActive === false) {
    throw new BadRequestError('You cannot deactivate your own account');
  }

  if (existing.id === session.sub && body.role && body.role !== existing.role) {
    throw new BadRequestError('You cannot change your own role');
  }

  // ADMIN cannot promote anyone to OWNER — only OWNER can change roles to OWNER
  if (session.role === 'ADMIN' && body.role === 'OWNER') {
    throw new ForbiddenError('Only OWNER may promote a user to OWNER role');
  }

  const nextEmail = body.email === '' ? null : body.email?.trim().toLowerCase();
  if (nextEmail || body.displayName || body.role || typeof body.isActive === 'boolean') {
    const duplicate = nextEmail
      ? await prisma.adminUser.findFirst({
          where: {
            id: { not: existing.id },
            email: { equals: nextEmail, mode: 'insensitive' },
          },
        })
      : null;

    if (duplicate) {
      throw new ConflictError('Email is already in use');
    }
  }

  const updated = await prisma.adminUser.update({
    where: { id: existing.id },
    data: {
      displayName: body.displayName?.trim() ?? existing.displayName,
      email: body.email === undefined ? existing.email : nextEmail,
      role: body.role ?? existing.role,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : existing.isActive,
      passwordHash: body.password ? hashPassword(body.password) : existing.passwordHash,
      forcePasswordChange: body.password ? true : existing.forcePasswordChange,
    },
    select: {
      id: true,
      username: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      forcePasswordChange: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await logAudit({
    req,
    action: 'ADMIN_USER_UPDATED',
    entityType: 'AdminUser',
    entityId: updated.id,
    metadata: {
      displayName: updated.displayName,
      role: updated.role,
      isActive: updated.isActive,
      passwordChanged: Boolean(body.password),
      forcePasswordChange: body.password ? true : updated.forcePasswordChange,
      email: updated.email,
    },
  });

  return NextResponse.json({
    success: true,
    data: updated,
    message: 'User updated successfully',
  } as ApiResponse<typeof updated>);
});
