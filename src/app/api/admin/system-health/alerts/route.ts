import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getAlerts, clearAlerts, getActiveAlertCount } from '@/lib/metrics/alerts';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { getLastRestoreTestResult } from '@/lib/dr/restore-validator';
import { getSnapshot } from '@/lib/metrics/registry';

export const dynamic = 'force-dynamic';

const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireRole(req, ['ADMIN', 'OWNER']);

  const path = new URL(req.url).pathname;

  // GET /api/admin/system-health/alerts/restore-test
  if (path.endsWith('/restore-test')) {
    const lastResult = getLastRestoreTestResult();
    const metrics = getSnapshot();
    const restoreTestMetric = metrics.gauges.find(
      (g) => g.name === 'restore_test_last_success'
    );
    const lastSuccessTimestamp = restoreTestMetric?.value ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        lastTest: lastResult ?? null,
        lastSuccessTimestamp,
        description: 'Automated restore test result. Runs weekly via cron (Sunday 04:00 AM ICT).',
      },
    });
  }

  // GET /api/admin/system-health/alerts — original behavior
  const alerts = getAlerts();
  const activeCount = getActiveAlertCount();

  // Run audit chain integrity probe as part of health check (lightweight)
  const probe = await import('@/modules/audit/audit-integrity.service').then(m => m.probeAuditChainIntegrity());

  return NextResponse.json({
    success: true,
    data: {
      alerts,
      activeCount,
      audit: {
        healthy: probe.healthy,
        lastSeq: probe.lastSeq?.toString() ?? null,
        lastEventHash: probe.lastEventHash,
      },
    },
  });
});

export const DELETE = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`alerts-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  await await requireRole(req, ['ADMIN', 'OWNER']);
  clearAlerts();
  return NextResponse.json({ success: true, data: { cleared: true } });
});
