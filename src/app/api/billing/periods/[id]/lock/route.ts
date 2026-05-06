import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { lockBillingPeriod } from '@/modules/billing/period-closing.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { BILLING_PERIOD_STATUS } from '@/lib/constants';

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ============================================================================
// POST /api/billing/periods/[id]/lock
// Transitions: CLOSED → LOCKED (IRREVERSIBLE)
//
// LOCK = Final accounting lock.
// - ALL invoices become IMMUTABLE
// - No adjustments allowed — must create ADJUSTMENT documents
// - Period itself becomes read-only
// - Auto-locks all SENT invoices (documentStatus → LOCKED)
// - Creates BillingPeriodCloseEvent audit record
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, resetAt } = await limiter.check(`billing-lock:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
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

    // Idempotency: if already LOCKED, return success
    if (period.status === BILLING_PERIOD_STATUS.LOCKED) {
      return NextResponse.json({
        success: true,
        data: { periodId, status: BILLING_PERIOD_STATUS.LOCKED, message: 'Period already LOCKED' },
        message: 'Period already LOCKED.',
      } as ApiResponse<{ periodId: string; status: string; message: string }>);
    }

    // Only CLOSED periods can be locked
    if (period.status !== BILLING_PERIOD_STATUS.CLOSED) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Cannot lock period in ${period.status} status. Only CLOSED periods can be locked.`,
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
    try {
      const body = await req.json();
      reason = body.reason;
    } catch {
      // No body — that's fine
    }

    // Check for pending import batches — reject if any exist
    const pendingImports = await prisma.importBatch.count({
      where: {
        billingPeriodId: periodId,
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });
    if (pendingImports > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Cannot lock period — ${pendingImports} import batch(es) still in progress. Complete or cancel pending imports before locking.`,
            code: 'PENDING_IMPORTS',
            name: 'BadRequestError',
            statusCode: 400,
          },
        },
        { status: 400 }
      );
    }

    // Perform lock in transaction
    const closeEvent = await prisma.$transaction(async (tx) => {
      return lockBillingPeriod(tx, periodId, _session.sub, reason);
    });

    logger.info({
      type: 'billing_period_lock_api',
      periodId,
      year: period.year,
      month: period.month,
      lockedBy: _session.sub,
      reason,
    });

    return NextResponse.json({
      success: true,
      data: {
        periodId,
        year: period.year,
        month: period.month,
        status: BILLING_PERIOD_STATUS.LOCKED,
        closeEventId: closeEvent.id,
        lockedAt: closeEvent.createdAt.toISOString(),
      },
      message: `Period ${period.year}/${String(period.month).padStart(2, '0')} locked successfully. This action is IRREVERSIBLE.`,
    } as ApiResponse<{
      periodId: string;
      year: number;
      month: number;
      status: string;
      closeEventId: string;
      lockedAt: string;
    }>);
  }
);