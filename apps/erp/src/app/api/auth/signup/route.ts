import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, ApiResponse, BadRequestError, ConflictError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { setAuthCookies } from '@/lib/auth/session';

const signUpSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/),
  displayName: z.string().min(2).max(100),
  email: z.string().email().optional().or(z.literal('')),
  password: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = signUpSchema.parse(await req.json());
  if (body.password !== body.confirmPassword) {
    throw new BadRequestError('Passwords do not match');
  }

  const existingUsers = await prisma.adminUser.count();
  const firstUser = existingUsers === 0;

  const username = body.username.trim().toLowerCase();
  const email = body.email?.trim().toLowerCase() || null;

  const [duplicateUser, duplicateRequest] = await Promise.all([
    prisma.adminUser.findFirst({
      where: {
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
    }),
    prisma.staffRegistrationRequest.findFirst({
      where: {
        status: 'PENDING',
        OR: [
          { username: { equals: username, mode: 'insensitive' } },
          ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ],
      },
    }),
  ]);

  if (duplicateUser || duplicateRequest) {
    throw new ConflictError('Username or email is already in use');
  }

  if (!firstUser) {
    const request = await prisma.staffRegistrationRequest.create({
      data: {
        username,
        email,
        displayName: body.displayName.trim(),
        passwordHash: hashPassword(body.password),
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        requestId: request.id,
        status: request.status,
      },
      message: 'Staff registration submitted. The owner must approve your request before you can sign in.',
    } as ApiResponse<{ requestId: string; status: typeof request.status }>);
  }

  const user = await prisma.adminUser.create({
    data: {
      username,
      email,
      displayName: body.displayName.trim(),
      passwordHash: hashPassword(body.password),
      role: firstUser ? 'ADMIN' : 'STAFF',
      forcePasswordChange: false,
    },
  });

  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const res = NextResponse.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      bootstrap: true,
    },
    message: 'Initial admin account created',
  } as ApiResponse<{
    user: {
      id: string;
      username: string;
      displayName: string;
      role: typeof user.role;
    };
    bootstrap: boolean;
  }>);

  setAuthCookies(res, {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    forcePasswordChange: false,
    exp: expiresAt,
  });

  return res;
});
