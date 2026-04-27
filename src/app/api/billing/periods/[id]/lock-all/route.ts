import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/billing/periods/[id]/lock-all
// Lock ALL DRAFT RoomBilling records in a billing period at once.
// Also computes common area water (ส่วนกลาง) share per room when enabled
// on the billing rule and bulk units are set on the period.
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

    // Fetch all DRAFT billings with their rules and rooms to compute common-area water share
    const draftBillings = await prisma.roomBilling.findMany({
      where: { billingPeriodId: periodId, status: 'DRAFT' },
      include: {
        effectiveRule: true,
        room: true,
      },
    });

    // period now has commonAreaWaterUnits / commonAreaWaterAmount from schema — cast to access
    const periodWithWater = period as typeof period & {
      commonAreaWaterUnits: Prisma.Decimal | null;
      commonAreaWaterAmount: Prisma.Decimal | null;
    };

    // Atomic: compute common-area share per room + lock records + update period status
    const result = await prisma.$transaction(async (tx) => {
      // Compute per-room common-area water share only when bulk units are configured
      if (periodWithWater.commonAreaWaterUnits && periodWithWater.commonAreaWaterAmount) {
        const bulkUnits = Number(periodWithWater.commonAreaWaterUnits);
        const bulkCost = Number(periodWithWater.commonAreaWaterAmount);
        const occupiedCount = draftBillings.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (b) => (b.room as any)?.roomStatus !== 'MAINTENANCE' && (b.room as any)?.roomStatus !== 'OWNER_USE'
        ).length;

        if (bulkUnits > 0 && occupiedCount > 0) {
          const costPerRoom = bulkCost / occupiedCount;

          // Update each room's commonAreaWaterShare
          // commonAreaWaterShare is Decimal? in Prisma schema — use Decimal.js via Prisma's driver
          await Promise.all(
            draftBillings
              .filter((b) => b.room && b.room.roomStatus !== 'MAINTENANCE' && b.room.roomStatus !== 'OWNER_USE')
              .map((b) =>
                tx.roomBilling.update({
                  where: { id: b.id },
                  data: {
                    commonAreaWaterShare: new Prisma.Decimal(costPerRoom),
                  },
                })
              )
          );

          logger.info({
            type: 'common_area_water_allocated',
            periodId,
            bulkUnits,
            bulkCost,
            occupiedCount,
            costPerRoom,
          });
        }
      }

      const r = await tx.roomBilling.updateMany({
        where: { billingPeriodId: periodId, status: 'DRAFT' },
        data: { status: 'LOCKED' },
      });

      // Only promote period to LOCKED if at least one record was locked
      if (r.count > 0) {
        await tx.billingPeriod.update({
          where: { id: periodId },
          data: { status: 'LOCKED' },
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
