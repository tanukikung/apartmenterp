import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { ROOM_STATUS } from '@/lib/constants';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ============================================================================
// POST /api/billing/periods/[id]/lock-all
// Lock ALL DRAFT RoomBilling records in a billing period at once.
// Also computes common area water (ส่วนกลาง) share per room when enabled
// on the billing rule and bulk units are set on the period.
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`billing-lock:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many billing requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }

    const { id: periodId } = params;
    requireRole(req, ['ADMIN', 'OWNER']);

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
          (b) => b.room.roomStatus !== ROOM_STATUS.MAINTENANCE && b.room.roomStatus !== ROOM_STATUS.OWNER_USE
        ).length;

        if (bulkUnits > 0 && occupiedCount > 0) {
          const costPerRoom = bulkCost / occupiedCount;

          // Update each room's commonAreaWaterShare
          // commonAreaWaterShare is Decimal? in Prisma schema — use Decimal.js via Prisma's driver
          await Promise.all(
            draftBillings
              .filter((b) => b.room && b.room.roomStatus !== ROOM_STATUS.MAINTENANCE && b.room.roomStatus !== ROOM_STATUS.OWNER_USE)
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
