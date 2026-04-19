import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, BadRequestError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { parsePagination } from '@/lib/utils/pagination';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';

/**
 * Dead-Letter Queue (DLQ) admin API
 *
 * The outbox processor quarantines events after `OUTBOX_DEAD_LETTER_THRESHOLD`
 * failed retries (default 3). Without a manual retry path those events are
 * effectively lost — tenants never get the invoice, reminder, or receipt that
 * was queued.
 *
 * This endpoint gives ADMINs visibility and control:
 *   GET    → list dead-lettered events (paginated, filterable by type)
 *   POST   → requeue one or more events by id (sets retryCount=0, clears lastError)
 *   DELETE → permanently drop an event (when it's known-bad data and should never retry)
 */

const DEAD_LETTER_THRESHOLD = Number(process.env.OUTBOX_DEAD_LETTER_THRESHOLD ?? '3');

// ── GET ── list dead-lettered events ─────────────────────────────────────────

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);
  const { page, pageSize, skip } = parsePagination(req, { defaultSize: 25, max: 100 });
  const { searchParams } = new URL(req.url);
  const eventType = searchParams.get('eventType') || undefined;

  const where = {
    processedAt: null,
    retryCount: { gte: DEAD_LETTER_THRESHOLD },
    ...(eventType ? { eventType } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.outboxEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.outboxEvent.count({ where }),
  ]);

  const data = {
    items,
    total,
    page,
    pageSize,
    threshold: DEAD_LETTER_THRESHOLD,
  };
  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
});

// ── POST ── requeue (reset retryCount) ───────────────────────────────────────

const requeueSchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(500),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const body = await req.json().catch(() => ({}));
  const parsed = requeueSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError('Body must be { eventIds: string[] } (1..500 UUIDs)');
  }

  // Only requeue events that are actually dead-lettered — never touch
  // healthy queued events or already-processed ones.
  const result = await prisma.outboxEvent.updateMany({
    where: {
      id: { in: parsed.data.eventIds },
      processedAt: null,
      retryCount: { gte: DEAD_LETTER_THRESHOLD },
    },
    data: {
      retryCount: 0,
      lastError: null,
    },
  });

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'OUTBOX_DEAD_LETTER_REQUEUED',
    entityType: 'OUTBOX_EVENT',
    entityId: parsed.data.eventIds.join(','),
    metadata: { requested: parsed.data.eventIds.length, requeued: result.count },
  });

  logger.info({
    type: 'outbox_dead_letter_requeued',
    actorId: session.sub,
    requested: parsed.data.eventIds.length,
    requeued: result.count,
  });

  const data = { requested: parsed.data.eventIds.length, requeued: result.count };
  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
});

// ── DELETE ── drop events permanently ────────────────────────────────────────

const dropSchema = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(500),
  reason: z.string().min(3).max(500),
});

export const DELETE = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN']);
  const body = await req.json().catch(() => ({}));
  const parsed = dropSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError('Body must be { eventIds: string[] (1..500), reason: string }');
  }

  // Only drop dead-lettered events. Never purge anything that might still
  // process normally.
  const result = await prisma.outboxEvent.deleteMany({
    where: {
      id: { in: parsed.data.eventIds },
      processedAt: null,
      retryCount: { gte: DEAD_LETTER_THRESHOLD },
    },
  });

  await logAudit({
    actorId: session.sub,
    actorRole: session.role,
    action: 'OUTBOX_DEAD_LETTER_DROPPED',
    entityType: 'OUTBOX_EVENT',
    entityId: parsed.data.eventIds.join(','),
    metadata: {
      requested: parsed.data.eventIds.length,
      dropped: result.count,
      reason: parsed.data.reason,
    },
  });

  logger.warn({
    type: 'outbox_dead_letter_dropped',
    actorId: session.sub,
    requested: parsed.data.eventIds.length,
    dropped: result.count,
    reason: parsed.data.reason,
  });

  const data = { requested: parsed.data.eventIds.length, dropped: result.count };
  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
});
