import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

const searchSchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters'),
});

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER']);

  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get('q') ?? '';

  const parsed = searchSchema.safeParse({ q: rawQ });
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? 'Invalid search query',
        },
      } as ApiResponse<never>,
      { status: 400 }
    );
  }

  const q = parsed.data.q;

  const [rooms, tenants, invoices] = await Promise.all([
    prisma.room.findMany({
      where: { roomNo: { contains: q, mode: 'insensitive' } },
      take: 5,
      select: { roomNo: true, floorNo: true, roomStatus: true },
    }),
    prisma.tenant.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    }),
    prisma.invoice.findMany({
      where: {
        OR: [
          { id: { contains: q, mode: 'insensitive' } },
          { roomNo: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, roomNo: true, year: true, month: true, status: true, totalAmount: true },
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: { rooms, tenants, invoices },
  } as ApiResponse<unknown>);
});