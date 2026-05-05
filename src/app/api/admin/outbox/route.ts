import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { parsePagination } from '@/lib/utils/pagination';

/**
 * GET /api/admin/outbox
 * Admin: list pending (non-dead-letter) outbox events.
 *
 * Query params:
 * - eventType: string (optional) — filter by event type
 * - page: number (default: 1)
 * - pageSize: number (default: 25, max: 100)
 *
 * Dead-lettered events are NOT included — those are in /api/admin/outbox/dead-letter
 */
export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireRole(req, ['ADMIN', 'OWNER']);

  const { page, pageSize, skip } = parsePagination(req, { defaultSize: 25, max: 100 });
  const { searchParams } = new URL(req.url);
  const eventType = searchParams.get('eventType') || undefined;

  const where: Record<string, unknown> = {
    processedAt: null,
    retryCount: { lt: Number(process.env.OUTBOX_DEAD_LETTER_THRESHOLD ?? '3') },
  };
  if (eventType) where.eventType = eventType;

  const [items, total] = await Promise.all([
    prisma.outboxEvent.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.outboxEvent.count({ where }),
  ]);

  const data = { items, total, page, pageSize };
  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
});
