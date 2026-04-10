/**
 * Single Broadcast API — get, cancel a broadcast.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';

const updateSchema = z.object({
  status: z.enum(['FAILED']).optional(),
});

// GET /api/broadcast/[id]
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) throw new NotFoundError('Broadcast', id);

  const broadcast = await prisma.broadcast.findUnique({ where: { id } });
  if (!broadcast) throw new NotFoundError('Broadcast', id);

  return NextResponse.json({ success: true, data: broadcast } as ApiResponse<unknown>);
});

// PATCH /api/broadcast/[id] — cancel a pending broadcast
export const PATCH = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) throw new NotFoundError('Broadcast', id);

  const body = await req.json().catch(() => ({}));
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