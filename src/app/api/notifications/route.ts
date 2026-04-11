import { NextRequest, NextResponse } from 'next/server';
import { NotificationStatus } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || '20')));
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

  const where = unreadOnly ? { status: NotificationStatus.PENDING } : {};

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { status: NotificationStatus.PENDING } }),
  ]);

  return NextResponse.json({
    success: true,
    data: { notifications, unreadCount, limit },
  } as ApiResponse<unknown>);
});
