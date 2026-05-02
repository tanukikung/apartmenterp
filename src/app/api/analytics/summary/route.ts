import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { requireOperator } from '@/lib/auth/guards';
import { getEffectiveInvoiceStatus } from '@/modules/invoices/status';

type SummaryData = {
  monthlyRevenue: number;
  /** Cash-basis: sum of totalAmount for PAID invoices where paidAt is this month */
  cashRevenue: number;
  /** Accrual-basis: sum of totalAmount for all invoices in current period (regardless of paidAt) */
  accrualRevenue: number;
  /** Sum of totalAmount for GENERATED/SENT/VIEWED/OVERDUE invoices in current period */
  outstandingAmount: number;
  /** Sum of totalAmount for effective OVERDUE invoices */
  overdueAmount: number;
  unpaidInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: SummaryData; expiry: number } | null = null;

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireOperator(req);
  const now = Date.now();
  if (cache && cache.expiry > now) {
    return NextResponse.json({ success: true, data: cache.value } as ApiResponse<SummaryData>);
  }

  const today = new Date();
  // Cash-basis: revenue for "this month" = invoices paid during this month (paidAt).
  // This matches the revenue trend chart so the KPI and chart always agree.
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));

  const revenueAgg = await prisma.invoice.aggregate({
    where: { status: 'PAID', paidAt: { gte: monthStart, lt: nextMonthStart } },
    _sum: { totalAmount: true },
  });
  const cashRevenue = Number(revenueAgg._sum.totalAmount ?? 0);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  let monthlyRevenue = cashRevenue;

  // Fallback: if no paid invoices yet this month, show the amount billed for the current billing period.
  if (monthlyRevenue === 0) {
    const billedAgg = await prisma.roomBilling.aggregate({
      where: { billingPeriod: { year, month } },
      _sum: { totalDue: true },
    });
    monthlyRevenue = Number(billedAgg._sum.totalDue ?? 0);
  }

  // Accrual-basis: all invoices in current period, regardless of paid status
  const accrualAgg = await prisma.invoice.aggregate({
    where: { year, month },
    _sum: { totalAmount: true },
  });
  const accrualRevenue = Number(accrualAgg._sum.totalAmount ?? 0);

  // Fetch active-status invoices for outstanding/overdue computation
  // We need effective status, so fetch all GENERATED/SENT/VIEWED/OVERDUE invoices
  const activeInvoices = await prisma.invoice.findMany({
    where: { status: { in: ['GENERATED', 'SENT', 'VIEWED', 'OVERDUE'] } },
    select: { id: true, status: true, dueDate: true, paidAt: true, totalAmount: true },
  });

  let outstandingAmount = 0;
  let overdueAmount = 0;
  for (const inv of activeInvoices) {
    const effectiveStatus = getEffectiveInvoiceStatus({
      storedStatus: inv.status,
      dueDate: inv.dueDate,
      paidAt: inv.paidAt,
    });
    const amount = Number(inv.totalAmount);
    if (effectiveStatus === 'OVERDUE') {
      overdueAmount += amount;
      outstandingAmount += amount;
    } else if (effectiveStatus !== 'PAID' && effectiveStatus !== 'CANCELLED') {
      outstandingAmount += amount;
    }
  }

  const [unpaidInvoices, paidInvoices, overdueInvoices] = await Promise.all([
    prisma.invoice.count({ where: { status: { in: ['GENERATED', 'SENT', 'VIEWED'] } } }),
    prisma.invoice.count({ where: { status: 'PAID' } }),
    prisma.invoice.count({ where: { status: 'OVERDUE' } }),
  ]);

  const value: SummaryData = {
    monthlyRevenue,
    cashRevenue,
    accrualRevenue,
    outstandingAmount,
    overdueAmount,
    unpaidInvoices,
    paidInvoices,
    overdueInvoices,
  };
  cache = { value, expiry: now + CACHE_TTL_MS };

  return NextResponse.json({ success: true, data: value } as ApiResponse<SummaryData>);
});
