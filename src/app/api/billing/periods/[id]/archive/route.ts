import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { archiveBillingPeriod } from '@/modules/billing/period-closing.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { BILLING_PERIOD_STATUS } from '@/lib/constants';

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ============================================================================
// POST /api/billing/periods/[id]/archive
// Transitions: LOCKED → ARCHIVED (IRREVERSIBLE)
//
// ARCHIVE = Read-only historical record. Terminal state.
// - All data is frozen — no changes of any kind allowed
// - Creates BillingPeriodCloseEvent audit record
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining: _remaining, resetAt } = await limiter.check(`billing-archive:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`,
            code: 'RATE_LIMIT_EXCEEDED',
            name: 'RateLimitError',
            statusCode: 429,
          },
        },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)) } }
      );
    }

    const { id: periodId } = params;
    const _session = await requireRole(req, ['ADMIN', 'OWNER']);

    // Verify period exists
    const period = await prisma.billingPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, year: true, month: true, status: true },
    });
    if (!period) {
      return NextResponse.json(
        { success: false, error: 'Billing period not found' },
        { status: 404 }
      );
    }

    // Idempotency: if already ARCHIVED, return success
    if (period.status === BILLING_PERIOD_STATUS.ARCHIVED) {
      return NextResponse.json({
        success: true,
        data: { periodId, status: BILLING_PERIOD_STATUS.ARCHIVED, message: 'Period already ARCHIVED' },
        message: 'Period already ARCHIVED.',
      } as ApiResponse<{ periodId: string; status: string; message: string }>);
    }

    // Only LOCKED periods can be archived
    if (period.status !== BILLING_PERIOD_STATUS.LOCKED) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Cannot archive period in ${period.status} status. Only LOCKED periods can be archived.`,
            code: 'INVALID_TRANSITION',
            name: 'ConflictError',
            statusCode: 409,
          },
        },
        { status: 409 }
      );
    }

    // Perform archive in transaction
    await prisma.$transaction(async (tx) => {
      return archiveBillingPeriod(tx, periodId, _session.sub);
    });

    logger.info({
      type: 'billing_period_archive_api',
      periodId,
      year: period.year,
      month: period.month,
      archivedBy: _session.sub,
    });

    return NextResponse.json({
      success: true,
      data: {
        periodId,
        year: period.year,
        month: period.month,
        status: BILLING_PERIOD_STATUS.ARCHIVED,
      },
      message: `Period ${period.year}/${String(period.month).padStart(2, '0')} archived successfully.`,
    } as ApiResponse<{ periodId: string; year: number; month: number; status: string }>);
  }
);