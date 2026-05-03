/**
 * GET /api/admin/health/messaging
 *
 * Combined inbox + outbox pipeline health.
 *
 * HTTP status:
 *   200 — everything nominal
 *   503 — any threshold breached (backlog, stale, DLQ overflow)
 *
 * Alert thresholds (env-overridable):
 *   INBOX_ALERT_THRESHOLD   (default 500)  — PENDING inbox events
 *   OUTBOX_ALERT_THRESHOLD  (default 300)  — PENDING outbox events
 *   DLQ_ALERT_THRESHOLD     (default 10)   — DEAD events in either queue
 *   STALE_AGE_SECONDS       (default 300)  — oldest pending event age
 *
 * Includes:
 *   - Exact counts for every state
 *   - Oldest pending event age (seconds)
 *   - Retry rate (failures in the last 60 min)
 *   - In-process metrics snapshot (counters + latency histogram)
 *   - Audit-log entry written when alert fires
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { getSnapshot } from '@/lib/metrics/messaging';

export const dynamic = 'force-dynamic';

const envInt = (k: string, d: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : d; };

const INBOX_ALERT_THRESHOLD  = envInt('INBOX_ALERT_THRESHOLD',  500);
const OUTBOX_ALERT_THRESHOLD = envInt('OUTBOX_ALERT_THRESHOLD', 300);
const DLQ_ALERT_THRESHOLD    = envInt('DLQ_ALERT_THRESHOLD',     10);
const STALE_AGE_SECONDS      = envInt('STALE_AGE_SECONDS',       300);

export interface MessagingHealthData {
  inbox: {
    pending:    number;
    processing: number;
    done:       number;
    failed:     number;
    dead:       number;
    oldestPendingAgeSeconds: number | null;
    retryRateLastHour: number;  // FAILED or retried events in last 60 min
  };
  outbox: {
    pending:         number;
    deadLetterCount: number;
    oldestPendingAgeSeconds: number | null;
    retryRateLastHour: number;
  };
  dlq: {
    inboxDead:  number;
    outboxDead: number;
    totalDead:  number;
  };
  alertFired:   boolean;
  alertReasons: string[];
  thresholds: {
    inboxPending:  number;
    outboxPending: number;
    dlqSize:       number;
    staleSeconds:  number;
  };
  metrics:      ReturnType<typeof getSnapshot>;
  checkedAt:    string;
}

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER', 'STAFF']);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000);

  const [
    inboxPending,
    inboxProcessing,
    inboxDone,
    inboxFailed,
    inboxDead,
    inboxOldest,
    inboxRetries,
    outboxPending,
    outboxDead,
    outboxOldest,
    outboxRetries,
  ] = await Promise.all([
    prisma.inboxEvent.count({ where: { status: 'PENDING' } }),
    prisma.inboxEvent.count({ where: { status: 'PROCESSING' } }),
    prisma.inboxEvent.count({ where: { status: 'DONE' } }),
    prisma.inboxEvent.count({ where: { status: 'FAILED' } }),
    prisma.inboxEvent.count({ where: { status: 'DEAD' } }),
    prisma.inboxEvent.findFirst({
      where:   { status: 'PENDING' },
      orderBy: { receivedAt: 'asc' },
      select:  { receivedAt: true },
    }),
    // Retry rate: events that failed in the last hour
    prisma.inboxEvent.count({
      where: {
        status:       { in: ['FAILED', 'DEAD'] },
        lastFailedAt: { gte: oneHourAgo },
      },
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
    prisma.outboxEvent.count({
      where: {
        lastFailedAt: { gte: oneHourAgo },
        lastError:    { not: null },
      },
    }),
  ]);

  const now = Date.now();
  const inboxOldestAge  = inboxOldest  ? Math.floor((now - inboxOldest.receivedAt.getTime())  / 1_000) : null;
  const outboxOldestAge = outboxOldest ? Math.floor((now - outboxOldest.createdAt.getTime())  / 1_000) : null;
  const totalDead       = inboxDead + outboxDead;

  const alertReasons: string[] = [];
  if (inboxPending  > INBOX_ALERT_THRESHOLD)                            alertReasons.push(`inbox backlog: ${inboxPending} pending (threshold ${INBOX_ALERT_THRESHOLD})`);
  if (outboxPending > OUTBOX_ALERT_THRESHOLD)                           alertReasons.push(`outbox backlog: ${outboxPending} pending (threshold ${OUTBOX_ALERT_THRESHOLD})`);
  if (totalDead     > DLQ_ALERT_THRESHOLD)                              alertReasons.push(`DLQ overflow: ${totalDead} dead events (threshold ${DLQ_ALERT_THRESHOLD})`);
  if (inboxOldestAge  !== null && inboxOldestAge  > STALE_AGE_SECONDS)  alertReasons.push(`oldest inbox event: ${inboxOldestAge}s old (threshold ${STALE_AGE_SECONDS}s)`);
  if (outboxOldestAge !== null && outboxOldestAge > STALE_AGE_SECONDS)  alertReasons.push(`oldest outbox event: ${outboxOldestAge}s old (threshold ${STALE_AGE_SECONDS}s)`);

  const alertFired = alertReasons.length > 0;

  if (alertFired) {
    logger.warn({ type: 'messaging_health_alert', alertReasons, inboxPending, outboxPending, totalDead });
    await logAudit({
      actorId: 'SYSTEM', actorRole: 'SYSTEM',
      action:  'OUTBOX_LAG_ALERT',
      entityType: 'MessagingPipeline', entityId: 'health',
      metadata: {
        severity: 'HIGH', alertReasons,
        inboxPending, outboxPending, inboxDead, outboxDead,
        checkedAt: new Date().toISOString(),
      },
    });
  }

  const data: MessagingHealthData = {
    inbox: {
      pending:    inboxPending,
      processing: inboxProcessing,
      done:       inboxDone,
      failed:     inboxFailed,
      dead:       inboxDead,
      oldestPendingAgeSeconds: inboxOldestAge,
      retryRateLastHour: inboxRetries,
    },
    outbox: {
      pending:         outboxPending,
      deadLetterCount: outboxDead,
      oldestPendingAgeSeconds: outboxOldestAge,
      retryRateLastHour: outboxRetries,
    },
    dlq: { inboxDead, outboxDead, totalDead },
    alertFired,
    alertReasons,
    thresholds: {
      inboxPending:  INBOX_ALERT_THRESHOLD,
      outboxPending: OUTBOX_ALERT_THRESHOLD,
      dlqSize:       DLQ_ALERT_THRESHOLD,
      staleSeconds:  STALE_AGE_SECONDS,
    },
    metrics:   getSnapshot(),
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json(
    { success: true, data } as ApiResponse<MessagingHealthData>,
    { status: alertFired ? 503 : 200 },
  );
});
