/**
 * Single Broadcast API — get, cancel a broadcast.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

const updateSchema = z.object({
  status: z.enum(['FAILED']).optional(),
});

// GET /api/broadcast/[id]
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) throw new NotFoundError('Broadcast', id ?? '');

  const broadcast = await prisma.broadcast.findUnique({ where: { id } });
  if (!broadcast) throw new NotFoundError('Broadcast', id);

  return NextResponse.json({ success: true, data: broadcast } as ApiResponse<unknown>);
});

// PATCH /api/broadcast/[id] — cancel a pending broadcast
export const PATCH = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`broadcast-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) throw new NotFoundError('Broadcast', id ?? '');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
  const input = updateSchema.parse(body);

  const existing = await prisma.broadcast.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Broadcast', id);

  if (existing.status !== 'PENDING' && existing.status !== 'SENDING') {
    return NextResponse.json(
      {
        success: false,
        error: { message: `Cannot cancel broadcast with status: ${existing.status}` },
      } as ApiResponse<unknown>,
      { status: 409 }
    );
  }

  const updated = await prisma.broadcast.update({
    where: { id },
    data: {
      status: input.status ?? ('FAILED' as const),
    },
  });

  return NextResponse.json({ success: true, data: updated } as ApiResponse<unknown>);
});