import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';

// Alert threshold: if the oldest unprocessed event is older than this, fire an alert.
const ALERT_THRESHOLD_SECONDS = 300; // 5 minutes

export const dynamic = 'force-dynamic';

export interface OutboxHealthData {
  queueDepth: number;
  deadLetterCount: number;
  oldestEventAgeSeconds: number | null;
  alertFired: boolean;
  alertThresholdSeconds: number;
  checkedAt: string;
}

// ============================================================================
// GET /api/admin/health/outbox
// Returns outbox queue depth, oldest event age, and dead-letter count.
// Fires an audit-log alert if oldest event age exceeds ALERT_THRESHOLD_SECONDS.
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER', 'STAFF']);

  const [queueDepth, deadLetterCount, oldest] = await Promise.all([
    // Unprocessed events that are still within retry budget
    prisma.outboxEvent.count({
      where: { processedAt: null, retryCount: { lt: 3 } },
    }),
    // Events that exhausted retries (marked processed with DEAD_LETTER error)
    prisma.outboxEvent.count({
      where: {
        processedAt: { not: null },
        lastError: { startsWith: 'DEAD_LETTER' },
      },
    }),
    // Oldest unprocessed event
    prisma.outboxEvent.findFirst({
      where: { processedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ]);

  const oldestEventAgeSeconds = oldest
    ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 1000)
    : null;

  const alertFired =
    oldestEventAgeSeconds !== null && oldestEventAgeSeconds > ALERT_THRESHOLD_SECONDS;

  if (alertFired) {
    logger.warn({
      type: 'outbox_lag_alert',
      queueDepth,
      oldestEventAgeSeconds,
      alertThresholdSeconds: ALERT_THRESHOLD_SECONDS,
    });
    // Write to audit log so the admin panel surfaces this as a system alert
    await logAudit({
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      action: 'OUTBOX_LAG_ALERT',
      entityType: 'OutboxEvent',
      entityId: 'queue',
      metadata: {
        severity: 'HIGH',
        queueDepth,
        deadLetterCount,
        oldestEventAgeSeconds,
        alertThresholdSeconds: ALERT_THRESHOLD_SECONDS,
        checkedAt: new Date().toISOString(),
      },
    });
  }

  const data: OutboxHealthData = {
    queueDepth,
    deadLetterCount,
    oldestEventAgeSeconds,
    alertFired,
    alertThresholdSeconds: ALERT_THRESHOLD_SECONDS,
    checkedAt: new Date().toISOString(),
  };

  return NextResponse.json({ success: true, data } as ApiResponse<OutboxHealthData>, {
    status: alertFired ? 503 : 200,
  });
});
