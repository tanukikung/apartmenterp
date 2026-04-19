import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '50')));
  const action = url.searchParams.get('action') || undefined;
  const entityType = url.searchParams.get('entityType') || undefined;
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);

  const where: Record<string, unknown> = {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
  };

  if (q) {
    where.OR = [
      { userName: { contains: q, mode: 'insensitive' } },
      { entityId: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
      { entityType: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      rows,
      total,
      limit,
    },
  } as ApiResponse<unknown>);
});
