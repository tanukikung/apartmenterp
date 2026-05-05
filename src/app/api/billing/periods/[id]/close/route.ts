import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { closeBillingPeriod } from '@/modules/billing/period-closing.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { BILLING_PERIOD_STATUS } from '@/lib/constants';

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ============================================================================
// POST /api/billing/periods/[id]/close
// Transitions: OPEN/DRAFT → CLOSED
//
// CLOSE = Manual close without locking invoices.
// - All invoices remain editable (adjustments allowed)
// - New invoices cannot be generated for this period
// - Creates BillingPeriodCloseEvent audit record
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`billing-close:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
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

    // Idempotency: if already CLOSED, return success without error
    if (period.status === BILLING_PERIOD_STATUS.CLOSED) {
      return NextResponse.json({
        success: true,
        data: { periodId, status: BILLING_PERIOD_STATUS.CLOSED, message: 'Period already CLOSED' },
        message: 'Period already CLOSED.',
      } as ApiResponse<{ periodId: string; status: string; message: string }>);
    }

    // Reject invalid transitions
    if (!([BILLING_PERIOD_STATUS.DRAFT, BILLING_PERIOD_STATUS.OPEN] as readonly string[]).includes(period.status as string)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Cannot close period in ${period.status} status. Only DRAFT or OPEN periods can be closed.`,
            code: 'INVALID_TRANSITION',
            name: 'ConflictError',
            statusCode: 409,
          },
        },
        { status: 409 }
      );
    }

    // Parse optional reason from body
    let reason: string | undefined;
    let force = false;
    try {
      const body = await req.json();
      reason = body.reason;
      force = Boolean(body.force);
    } catch {
      // No body — that's fine
    }

    // Check unpaid invoice warning unless force=true
    if (!force) {
      const unpaidCount = await prisma.invoice.count({
        where: {
          roomBilling: { billingPeriodId: periodId },
          status: { in: ['SENT', 'VIEWED', 'OVERDUE', 'GENERATED'] },
        },
      });
      if (unpaidCount > 0) {
        // Return warning — client should confirm with force=true
        return NextResponse.json({
          success: true,
          data: {
            periodId,
            year: period.year,
            month: period.month,
            status: period.status,
            unpaidCount,
            requiresConfirmation: true,
            message: `Period has ${unpaidCount} unpaid invoice(s). POST with { force: true } to close anyway.`,
          },
          message: `Warning: ${unpaidCount} unpaid invoice(s) will remain editable after close.`,
        } as ApiResponse<{
          periodId: string;
          year: number;
          month: number;
          status: string;
          unpaidCount: number;
          requiresConfirmation: boolean;
          message: string;
        }>);
      }
    }

    // Perform close in transaction
    const closeEvent = await prisma.$transaction(async (tx) => {
      return closeBillingPeriod(tx, periodId, _session.sub, { reason, force });
    });

    logger.info({
      type: 'billing_period_close_api',
      periodId,
      year: period.year,
      month: period.month,
      closedBy: _session.sub,
      reason,
    });

    return NextResponse.json({
      success: true,
      data: {
        periodId,
        year: period.year,
        month: period.month,
        status: BILLING_PERIOD_STATUS.CLOSED,
        closeEventId: closeEvent.id,
        closedAt: closeEvent.createdAt.toISOString(),
      },
      message: `Period ${period.year}/${String(period.month).padStart(2, '0')} closed successfully.`,
    } as ApiResponse<{
      periodId: string;
      year: number;
      month: number;
      status: string;
      closeEventId: string;
      closedAt: string;
    }>);
  }
);