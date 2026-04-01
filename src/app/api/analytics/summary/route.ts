import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { requireRole } from '@/lib/auth/guards';

type SummaryData = {
  monthlyRevenue: number;
  unpaidInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: SummaryData; expiry: number } | null = null;

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);
  const now = Date.now();
  if (cache && cache.expiry > now) {
    return NextResponse.json({ success: true, data: cache.value } as ApiResponse<SummaryData>);
  }

  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;

  // Try paid invoices first
  const revenueAgg = await prisma.invoice.aggregate({
    where: { status: 'PAID', year, month },
    _sum: { totalAmount: true },
  });
  let monthlyRevenue = Number(revenueAgg._sum.totalAmount ?? 0);

  // Fallback: if no paid invoices, use billed amount from RoomBilling
  if (monthlyRevenue === 0) {
    const billedAgg = await prisma.roomBilling.aggregate({
      where: { billingPeriod: { year, month } },
      _sum: { totalDue: true },
    });
    monthlyRevenue = Number(billedAgg._sum.totalDue ?? 0);
  }

  const [unpaidInvoices, paidInvoices, overdueInvoices] = await Promise.all([
    prisma.invoice.count({ where: { status: { in: ['GENERATED', 'SENT', 'VIEWED'] } } }),
    prisma.invoice.count({ where: { status: 'PAID' } }),
    prisma.invoice.count({ where: { status: 'OVERDUE' } }),
  ]);

  const value: SummaryData = {
    monthlyRevenue,
    unpaidInvoices,
    paidInvoices,
    overdueInvoices,
  };
  cache = { value, expiry: now + CACHE_TTL_MS };

  return NextResponse.json({ success: true, data: value } as ApiResponse<SummaryData>);
});
