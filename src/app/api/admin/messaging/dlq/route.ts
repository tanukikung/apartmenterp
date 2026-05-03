/**
 * Dead Letter Queue — list and bulk-retry
 *
 * GET  /api/admin/messaging/dlq
 *   Query params:
 *     type      inbox | outbox | both (default: both)
 *     since     ISO-8601 date  (filter by lastFailedAt ≥ since)
 *     errorCode string         (exact match on errorCode field)
 *     limit     number         (default: 50, max: 200)
 *     cursor    string         (pagination: last id from previous page)
 *
 * POST /api/admin/messaging/dlq/bulk-retry
 *   Body: { ids: string[], type: "inbox" | "outbox" }
 *   Resets each event to PENDING, clears retryCount + error fields.
 *   Processed in batches of 50 to avoid a single massive transaction.
 *   Idempotent: already-PENDING or DONE rows are silently skipped.
 *
 * Safety for outbox bulk-retry:
 *   Resetting an OutboxEvent (unsets processedAt) can cause a duplicate
 *   delivery if the original publish actually succeeded before the crash.
 *   Callers must pass acknowledgeOutboxRisk: true in the body.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import type { InboxEventStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const MAX_LIMIT   = 200;
const DEFAULT_LIMIT = 50;
const RETRY_BATCH  = 50;

// ── Shared types ─────────────────────────────────────────────────────────────

export interface DLQItem {
  id:           string;
  queueType:    'inbox' | 'outbox';
  eventId?:     string;   // inbox only
  eventType?:   string;   // outbox only
  aggregateType?: string;
  aggregateId?:   string;
  source?:      string;   // inbox only
  errorCode:    string | null;
  lastError:    string | null;
  lastFailedAt: string | null;
  retryCount:   number;
  createdAt:    string;
  receivedAt?:  string;   // inbox only
}

// ── GET /api/admin/messaging/dlq ─────────────────────────────────────────────

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER']);

  const url       = new URL(req.url);
  const type      = (url.searchParams.get('type') ?? 'both') as 'inbox' | 'outbox' | 'both';
  const sinceRaw  = url.searchParams.get('since');
  const errorCode = url.searchParams.get('errorCode') ?? undefined;
  const limit     = Math.min(Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT), MAX_LIMIT);
  const cursor    = url.searchParams.get('cursor') ?? undefined;
  const since     = sinceRaw ? new Date(sinceRaw) : undefined;

  const items: DLQItem[] = [];

  // ── Inbox dead events ─────────────────────────────────────────────────────
  if (type === 'inbox' || type === 'both') {
    const rows = await prisma.inboxEvent.findMany({
      where: {
        status:       'DEAD' as InboxEventStatus,
        ...(since      && { lastFailedAt: { gte: since } }),
        ...(errorCode  && { errorCode }),
        ...(cursor     && { id: { gt: cursor } }),
      },
      orderBy: { lastFailedAt: 'desc' },
      take:    limit,
      select: {
        id: true, eventId: true, source: true, errorCode: true,
        lastError: true, lastFailedAt: true, retryCount: true,
        receivedAt: true,
      },
    });

    items.push(...rows.map((r) => ({
      id:           r.id,
      queueType:    'inbox' as const,
      eventId:      r.eventId,
      source:       r.source,
      errorCode:    r.errorCode,
      lastError:    r.lastError,
      lastFailedAt: r.lastFailedAt?.toISOString() ?? null,
      retryCount:   r.retryCount,
      createdAt:    r.receivedAt.toISOString(),
      receivedAt:   r.receivedAt.toISOString(),
    })));
  }

  // ── Outbox dead-letter events ─────────────────────────────────────────────
  if (type === 'outbox' || type === 'both') {
    const rows = await prisma.outboxEvent.findMany({
      where: {
        lastError:    { startsWith: 'DEAD_LETTER' },
        processedAt:  { not: null },
        ...(since     && { lastFailedAt: { gte: since } }),
        ...(errorCode && { errorCode }),
        ...(cursor    && { id: { gt: cursor } }),
      },
      orderBy: { lastFailedAt: 'desc' },
      take:    limit,
      select: {
        id: true, eventType: true, aggregateType: true, aggregateId: true,
        errorCode: true, lastError: true, lastFailedAt: true, retryCount: true, createdAt: true,
      },
    });

    items.push(...rows.map((r) => ({
      id:            r.id,
      queueType:     'outbox' as const,
      eventType:     r.eventType,
      aggregateType: r.aggregateType,
      aggregateId:   r.aggregateId,
      errorCode:     r.errorCode,
      lastError:     r.lastError,
      lastFailedAt:  r.lastFailedAt?.toISOString() ?? null,
      retryCount:    r.retryCount,
      createdAt:     r.createdAt.toISOString(),
    })));
  }

  // Sort combined list by lastFailedAt desc
  items.sort((a, b) => {
    const ta = a.lastFailedAt ?? a.createdAt;
    const tb = b.lastFailedAt ?? b.createdAt;
    return tb.localeCompare(ta);
  });
  const page       = items.slice(0, limit);
  const nextCursor = page.length === limit ? page[page.length - 1]?.id : null;

  return NextResponse.json({
    success: true,
    data:    { items: page, nextCursor, total: page.length },
  } as ApiResponse<{ items: DLQItem[]; nextCursor: string | null; total: number }>);
});

// ── POST /api/admin/messaging/dlq/bulk-retry ──────────────────────────────────

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER']);

  const body = await req.json() as {
    ids:                  string[];
    type:                 'inbox' | 'outbox';
    acknowledgeOutboxRisk?: boolean;
  };

  const { ids, type, acknowledgeOutboxRisk = false } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ success: false, error: 'ids must be a non-empty array' }, { status: 400 });
  }
  if (type !== 'inbox' && type !== 'outbox') {
    return NextResponse.json({ success: false, error: 'type must be inbox or outbox' }, { status: 400 });
  }
  if (type === 'outbox' && !acknowledgeOutboxRisk) {
    return NextResponse.json({
      success: false,
      error: 'Retrying outbox events may cause duplicate message delivery if the original publish succeeded before the crash. Pass acknowledgeOutboxRisk: true to proceed.',
      code:  'OUTBOX_RETRY_RISK',
    }, { status: 409 });
  }

  let retried = 0;
  let skipped = 0;

  // Process in batches to avoid a single large transaction
  for (let i = 0; i < ids.length; i += RETRY_BATCH) {
    const batch = ids.slice(i, i + RETRY_BATCH);

    if (type === 'inbox') {
      const result = await prisma.inboxEvent.updateMany({
        where: { id: { in: batch }, status: 'DEAD' },
        data:  {
          status:       'PENDING',
          retryCount:   0,
          nextRetryAt:  null,
          lastError:    null,
          errorCode:    null,
          lastFailedAt: null,
        },
      });
      retried += result.count;
      skipped += batch.length - result.count;
    } else {
      // Outbox: unset processedAt so the processor picks it up again
      const result = await prisma.outboxEvent.updateMany({
        where: { id: { in: batch }, lastError: { startsWith: 'DEAD_LETTER' } },
        data:  {
          processedAt:  null,
          retryCount:   0,
          nextRetryAt:  null,
          lastError:    null,
          errorCode:    null,
          lastFailedAt: null,
        },
      });
      retried += result.count;
      skipped += batch.length - result.count;
    }
  }

  logger.info({
    type:    'dlq_bulk_retry',
    queue:   type,
    retried,
    skipped,
    total:   ids.length,
  });

  return NextResponse.json({
    success: true,
    data:    { retried, skipped },
    message: `${retried} event(s) queued for retry${skipped > 0 ? `, ${skipped} skipped (not in DEAD state)` : ''}`,
  });
});
