import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getAllJobEntries } from '@/modules/jobs/job-store';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`admin-jobs-reload:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);

  // The scheduler re-reads automation cron configs from DB once per minute
  // via the setInterval in instrumentation.ts. A manual reload here forces
  // an immediate re-read of the DB config and re-logging of the current schedule.
  const { prisma } = await import('@/lib');

  function parseCronExpr(expr: string): { hour: number; minute: number; dayOfMonth?: number; dayOfWeek?: number } | null {
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 5) return null;
    const [min, hr, dom, , dow] = parts;
    const h = parseInt(hr, 10);
    const m = parseInt(min, 10);
    if (isNaN(h) || isNaN(m)) return null;
    const result: { hour: number; minute: number; dayOfMonth?: number; dayOfWeek?: number } = { hour: h, minute: m };
    if (dom !== '*') result.dayOfMonth = parseInt(dom, 10);
    if (dow !== '*') result.dayOfWeek = parseInt(dow, 10);
    return result;
  }

  const configs = await prisma.config.findMany({
    where: { key: { in: ['automation.reminderCron', 'automation.overdueCron', 'automation.billingCron'] } },
  });

  const overrideMap: Record<string, { hour: number; minute: number; dayOfMonth?: number; dayOfWeek?: number }> = {};
  for (const cfg of configs) {
    const parsed = parseCronExpr(String(cfg.value ?? ''));
    if (parsed) {
      if (cfg.key === 'automation.reminderCron') overrideMap['auto-reminder'] = parsed;
      if (cfg.key === 'automation.overdueCron')  overrideMap['overdue-flag'] = parsed;
      if (cfg.key === 'automation.billingCron')  overrideMap['billing-generate'] = parsed;
    }
  }

  // Re-log so operators can verify via logs that overrides are being read correctly
  logger.info({ overrideCount: Object.keys(overrideMap).length, overrideMap }, 'Manual scheduler reload: automation cron overrides confirmed from DB');

  return NextResponse.json({
    success: true,
    message: 'ยืนยันการรีเฟรชตารางงานแล้ว การเปลี่ยนแปลงจะมีผลในรอบถัดไป (ภายใน 60 วินาที)',
    data: {
      overrideCount: Object.keys(overrideMap).length,
      overrides: overrideMap,
      jobs: getAllJobEntries(),
    },
  });
});