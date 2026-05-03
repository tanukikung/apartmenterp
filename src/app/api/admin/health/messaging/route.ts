import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';

export const dynamic = 'force-dynamic';

// Thresholds — 503 fires when either backlog exceeds these limits
const INBOX_ALERT_THRESHOLD   = 500;  // PENDING inbox events
const OUTBOX_ALERT_THRESHOLD  = 300;  // PENDING outbox events (5-minute threshold ~ 60 events)
const STALE_AGE_SECONDS       = 300;  // 5 minutes

export interface MessagingHealthData {
  inbox: {
    pending:       number;
    processing:    number;
    dead:          number;
    oldestPendingAgeSeconds: number | null;
  };
  outbox: {
    pending:         number;
    deadLetterCount: number;
    oldestPendingAgeSeconds: number | null;
  };
  alertFired:            boolean;
  alertReasons:          string[];
  alertThresholds: {
    inboxPending:  number;
    outboxPending: number;
    staleSeconds:  number;
  };
  checkedAt: string;
}

// ============================================================================
// GET /api/admin/health/messaging
// Combined inbox + outbox health. Returns 503 when any backlog exceeds threshold.
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER', 'STAFF']);

  const [
    inboxPending,
    inboxProcessing,
    inboxDead,
    inboxOldest,
    outboxPending,
    outboxDead,
    outboxOldest,
  ] = await Promise.all([
    prisma.inboxEvent.count({ where: { status: 'PENDING' } }),
    prisma.inboxEvent.count({ where: { status: 'PROCESSING' } }),
    prisma.inboxEvent.count({ where: { status: 'DEAD' } }),
    prisma.inboxEvent.findFirst({
      where:   { status: 'PENDING' },
      orderBy: { receivedAt: 'asc' },
      select:  { receivedAt: true },
    }),
    prisma.outboxEvent.count({ where: { processedAt: null, retryCount: { lt: 3 } } }),
    prisma.outboxEvent.count({
      where: { processedAt: { not: null }, lastError: { startsWith: 'DEAD_LETTER' } },
    }),
    prisma.outboxEvent.findFirst({
      where:   { processedAt: null },
      orderBy: { createdAt: 'asc' },
      select:  { createdAt: true },
    }),
  ]);

  const now = Date.now();
  const inboxOldestAge  = inboxOldest  ? Math.floor((now - inboxOldest.receivedAt.getTime())  / 1000) : null;
  const outboxOldestAge = outboxOldest ? Math.floor((now - outboxOldest.createdAt.getTime())  / 1000) : null;

  const alertReasons: string[] = [];
  if (inboxPending  > INBOX_ALERT_THRESHOLD)                        alertReasons.push(`inbox backlog: ${inboxPending} pending (threshold ${INBOX_ALERT_THRESHOLD})`);
  if (outboxPending > OUTBOX_ALERT_THRESHOLD)                       alertReasons.push(`outbox backlog: ${outboxPending} pending (threshold ${OUTBOX_ALERT_THRESHOLD})`);
  if (inboxOldestAge  !== null && inboxOldestAge  > STALE_AGE_SECONDS) alertReasons.push(`oldest inbox event: ${inboxOldestAge}s old`);
  if (outboxOldestAge !== null && outboxOldestAge > STALE_AGE_SECONDS) alertReasons.push(`oldest outbox event: ${outboxOldestAge}s old`);
  if (inboxDead > 0)                                                 alertReasons.push(`${inboxDead} inbox dead-letter event(s)`);

  const alertFired = alertReasons.length > 0;

  if (alertFired) {
    logger.warn({ type: 'messaging_health_alert', alertReasons, inboxPending, outboxPending });
    await logAudit({
      actorId:    'SYSTEM',
      actorRole:  'SYSTEM',
      action:     'OUTBOX_LAG_ALERT',
      entityType: 'MessagingPipeline',
      entityId:   'health',
      metadata: {
        severity:   'HIGH',
        alertReasons,
        inboxPending,
        outboxPending,
        inboxDead,
        outboxDead,
        checkedAt:  new Date().toISOString(),
      },
    });
  }

  const data: MessagingHealthData = {
    inbox: {
      pending:               inboxPending,
      processing:            inboxProcessing,
      dead:                  inboxDead,
      oldestPendingAgeSeconds: inboxOldestAge,
    },
    outbox: {
      pending:               outboxPending,
      deadLetterCount:       outboxDead,
      oldestPendingAgeSeconds: outboxOldestAge,
    },
    alertFired,
    alertReasons,
    alertThresholds: {
      inboxPending:  INBOX_ALERT_THRESHOLD,
      outboxPending: OUTBOX_ALERT_THRESHOLD,
      staleSeconds:  STALE_AGE_SECONDS,
    },
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json(
    { success: true, data } as ApiResponse<MessagingHealthData>,
    { status: alertFired ? 503 : 200 },
  );
});
