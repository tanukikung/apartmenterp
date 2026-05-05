import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { getPeriodCloseHistory } from '@/modules/billing/period-closing.service';

// ============================================================================
// GET /api/billing/periods/[id]/close-history
// Returns all BillingPeriodCloseEvent records for a billing period
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = await requireRole(req, ['ADMIN', 'OWNER', 'STAFF']);
    const { id: periodId } = params;

    // Verify period exists
    const period = await prisma.billingPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, year: true, month: true },
    });
    if (!period) {
      return NextResponse.json(
        { success: false, error: 'Billing period not found' },
        { status: 404 }
      );
    }

    const events = await getPeriodCloseHistory(periodId);

    return NextResponse.json({
      success: true,
      data: {
        periodId,
        year: period.year,
        month: period.month,
        events: events.map((e) => ({
          id: e.id,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          closedBy: e.closedBy,
          reason: e.reason,
          totalRoomsBilled: e.totalRoomsBilled,
          totalAmountBilled: Number(e.totalAmountBilled),
          totalInvoiced: e.totalInvoiced,
          totalAmountInvoiced: Number(e.totalAmountInvoiced),
          totalPaid: e.totalPaid,
          totalAmountPaid: Number(e.totalAmountPaid),
          totalUnpaid: e.totalUnpaid,
          totalAmountUnpaid: Number(e.totalAmountUnpaid),
          createdAt: e.createdAt.toISOString(),
        })),
      },
    } as ApiResponse<{
      periodId: string;
      year: number;
      month: number;
      events: Array<{
        id: string;
        fromStatus: string;
        toStatus: string;
        closedBy: string;
        reason: string | null;
        totalRoomsBilled: number;
        totalAmountBilled: number;
        totalInvoiced: number;
        totalAmountInvoiced: number;
        totalPaid: number;
        totalAmountPaid: number;
        totalUnpaid: number;
        totalAmountUnpaid: number;
        createdAt: string;
      }>;
    }>);
  }
);