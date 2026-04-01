import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/billing/periods/[id]/lock-all
// Lock ALL DRAFT RoomBilling records in a billing period at once.
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id: periodId } = params;
    requireRole(req, ['ADMIN']);

    // Verify period exists
    const period = await prisma.billingPeriod.findUnique({ where: { id: periodId } });
    if (!period) {
      return NextResponse.json({ success: false, error: 'Billing period not found' }, { status: 404 });
    }

    // Atomic: lock records + update period status together
    const result = await prisma.$transaction(async (tx) => {
      const r = await tx.roomBilling.updateMany({
        where: { billingPeriodId: periodId, status: 'DRAFT' },
        data:  { status: 'LOCKED' },
      });

      // Only promote period to LOCKED if at least one record was locked
      if (r.count > 0) {
        await tx.billingPeriod.update({
          where: { id: periodId },
          data:  { status: 'LOCKED' },
        });
      }

      return r;
    });

    logger.info({
      type:     'billing_period_lock_all',
      periodId,
      year:     period.year,
      month:    period.month,
      locked:   result.count,
    });

    return NextResponse.json({
      success: true,
      data: {
        periodId,
        year:   period.year,
        month:  period.month,
        locked: result.count,
      },
      message: `Locked ${result.count} billing records`,
    } as ApiResponse<{ periodId: string; year: number; month: number; locked: number }>);
  }
);
