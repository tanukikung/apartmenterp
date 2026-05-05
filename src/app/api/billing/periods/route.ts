import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { BILLING_PERIOD_STATUS } from '@/lib/constants';

// ============================================================================
// GET /api/billing/periods — List all billing periods with editable state info
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    const _session = await requireRole(req, ['ADMIN', 'OWNER', 'STAFF']);

    const periods = await prisma.billingPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: {
        id: true,
        year: true,
        month: true,
        status: true,
        dueDay: true,
        note: true,
        commonAreaWaterUnits: true,
        commonAreaWaterAmount: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            roomBillings: true,
            importBatches: true,
          },
        },
      },
    });

    // Compute summary stats per period
    const enriched = await Promise.all(
      periods.map(async (period) => {
        const [invoiceStats, closeEvent] = await Promise.all([
          prisma.invoice.findMany({
            where: { year: period.year, month: period.month },
            select: { status: true, totalAmount: true },
          }),
          prisma.billingPeriodCloseEvent.findFirst({
            where: { periodId: period.id, toStatus: BILLING_PERIOD_STATUS.LOCKED },
            orderBy: { createdAt: 'desc' },
            select: { closedBy: true, createdAt: true },
          }),
        ]);

        const totalInvoiced = invoiceStats.length;
        const totalAmountInvoiced = invoiceStats.reduce(
          (sum, inv) => sum + Number(inv.totalAmount),
          0
        );
        const paidCount = invoiceStats.filter((i) => i.status === 'PAID').length;
        const paidAmount = invoiceStats
          .filter((i) => i.status === 'PAID')
          .reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
        const unpaidCount = totalInvoiced - paidCount;
        const unpaidAmount = totalAmountInvoiced - paidAmount;

        return {
          id: period.id,
          year: period.year,
          month: period.month,
          status: period.status,
          dueDay: period.dueDay,
          note: period.note,
          commonAreaWaterUnits: period.commonAreaWaterUnits
            ? Number(period.commonAreaWaterUnits)
            : null,
          commonAreaWaterAmount: period.commonAreaWaterAmount
            ? Number(period.commonAreaWaterAmount)
            : null,
          roomBillingCount: period._count.roomBillings,
          importBatchCount: period._count.importBatches,
          invoiceStats: {
            totalInvoiced,
            totalAmountInvoiced,
            paidCount,
            paidAmount,
            unpaidCount,
            unpaidAmount,
          },
          lockedAt: closeEvent?.createdAt?.toISOString() ?? null,
          lockedBy: closeEvent?.closedBy ?? null,
          isEditable: ([BILLING_PERIOD_STATUS.OPEN, BILLING_PERIOD_STATUS.DRAFT] as readonly string[]).includes(
            period.status as string
          ),
          isTerminal: ['LOCKED', 'ARCHIVED'].includes(period.status),
          createdAt: period.createdAt.toISOString(),
          updatedAt: period.updatedAt.toISOString(),
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enriched,
    } as ApiResponse<typeof enriched>);
  }
);