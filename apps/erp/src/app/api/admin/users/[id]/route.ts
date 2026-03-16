import { NextRequest, NextResponse } from 'next/server';
import { AdminRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { getRequestIp, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, BadRequestError, ConflictError, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

const updateUserSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  role: z.nativeEnum(AdminRole).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(128).optional().or(z.literal('')),
});

export const PATCH = asyncHandler(async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
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
    actorId: session.sub,
    actorRole: session.role,
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
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({
    success: true,
    data: updated,
    message: 'User updated successfully',
  } as ApiResponse<typeof updated>);
});
