import { NextRequest, NextResponse } from 'next/server';
import { AdminRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { getRequestIp, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, ConflictError, ForbiddenError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';

const createUserSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  displayName: z.string().min(2).max(100),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(8).max(128),
  role: z.nativeEnum(AdminRole).default('STAFF'),
});

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const [users, resetTokens, pendingRequests] = await Promise.all([
    prisma.adminUser.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
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
    }),
    prisma.passwordResetToken.findMany({
      where: {
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
    prisma.staffRegistrationRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const resetMap = new Map(resetTokens.map((token) => [token.userId, token]));

  return NextResponse.json({
    success: true,
    data: {
      users: users.map((user) => {
        const resetToken = resetMap.get(user.id);
        return {
          ...user,
          pendingReset: resetToken
            ? {
                id: resetToken.id,
                createdAt: resetToken.createdAt,
                expiresAt: resetToken.expiresAt,
              }
            : null,
        };
      }),
      pendingRequests,
    },
  } as ApiResponse<
    {
      users: Array<{
        id: string;
        username: string;
        email: string | null;
        displayName: string;
        role: AdminRole;
        isActive: boolean;
        forcePasswordChange: boolean;
        createdAt: Date;
        updatedAt: Date;
        pendingReset: {
          id: string;
          createdAt: Date;
          expiresAt: Date;
        } | null;
      }>;
      pendingRequests: Array<{
        id: string;
        username: string;
        email: string | null;
        displayName: string;
        status: 'PENDING';
        createdAt: Date;
      }>;
    }
  >);
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const body = createUserSchema.parse(await req.json());
  const username = body.username.trim().toLowerCase();
  const email = body.email?.trim().toLowerCase() || null;

  // Prevent non-bootstrap admins from creating new ADMIN users.
  // Once the system has more than 1 admin, no further ADMIN accounts can be created
  // (this is a deliberate design choice — ADMIN role should be rare and deliberate).
  if (body.role === 'ADMIN') {
    const adminCount = await prisma.adminUser.count({ where: { role: 'ADMIN' } });
    if (adminCount > 0) {
      throw new ForbiddenError('Cannot create additional ADMIN users. Contact the existing admin.');
    }
  }

  const duplicate = await prisma.adminUser.findFirst({
    where: {
      OR: [
        { username: { equals: username, mode: 'insensitive' } },
        ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
      ],
    },
  });

  if (duplicate) {
    throw new ConflictError('Username or email is already in use');
  }

  const user = await prisma.adminUser.create({
    data: {
      username,
      email,
      displayName: body.displayName.trim(),
      passwordHash: hashPassword(body.password),
      role: body.role,
      forcePasswordChange: true,
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
    action: 'ADMIN_USER_CREATED',
    entityType: 'AdminUser',
    entityId: user.id,
    metadata: {
      username: user.username,
      role: user.role,
      email: user.email,
      forcePasswordChange: true,
    },
    ipAddress: getRequestIp(req),
  });

  return NextResponse.json({
    success: true,
    data: user,
    message: 'User created successfully',
  } as ApiResponse<typeof user>);
});
