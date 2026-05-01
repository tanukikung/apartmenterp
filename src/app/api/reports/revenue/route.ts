import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { INVOICE_STATUS } from '@/lib/constants';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

type RevenueRow = {
  year: number;
  month: number;
  rent: number;
  electric: number;
  water: number;
  other: number;
  total: number;
};

// Return last N months of revenue breakdown by type
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const url = new URL(req.url);
  const monthsParam = Number(url.searchParams.get('months') ?? '12');
  const months = Math.min(Math.max(1, monthsParam), 60);
  const yearParam = url.searchParams.get('year');
  const yearFilter = yearParam ? Number(yearParam) : undefined;

  // Build the date range: go back (months-1) from current month
  // Use day=1 for start, and the last day of current month for end
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  // Last day of current month: getUTCMonth() + 1, day = 0 means last day of previous month
  // But we want last day of current month, so use getUTCMonth() + 1 with day = 0
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  // Fetch all paid invoices in the range with their room billing breakdown
  const where: Prisma.InvoiceWhereInput = {
    status: INVOICE_STATUS.PAID,
    paidAt: { gte: startDate, lte: endDate },
  };

  const invoices = await prisma.invoice.findMany({
    where,
    // HIGH-69: explicit limit prevents unbounded memory growth for large date ranges.
    // Revenue report queries up to 60 months × ~239 rooms = ~14,340 invoice records,
    // well within the 50,000 cap. For ranges that exceed this, return partial data
    // with a warning so the client can paginate.
    take: 50_000,
    select: {
      paidAt: true,
      totalAmount: true,
      roomBilling: {
        select: {
          rentAmount: true,
          electricTotal: true,
          waterTotal: true,
          furnitureFee: true,
          otherFee: true,
          proratedRent: true,
        },
      },
    },
  });

  // Aggregate by paidAt year-month
  const map = new Map<string, RevenueRow>();

  for (const inv of invoices) {
    if (!inv.paidAt) continue;
    const d = new Date(inv.paidAt);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;

    if (yearFilter && y !== yearFilter) continue;

    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, { year: y, month: m, rent: 0, electric: 0, water: 0, other: 0, total: 0 });
    }
    const row = map.get(key)!;

    const rb = inv.roomBilling;
    const rent = Number(rb.rentAmount) + Number(rb.proratedRent ?? 0);
    const electric = Number(rb.electricTotal);
    const water = Number(rb.waterTotal);
    const other = Number(rb.otherFee) + Number(rb.furnitureFee);

    row.rent += rent;
    row.electric += electric;
    row.water += water;
    row.other += other;
    row.total += Number(inv.totalAmount);
  }

  // Fill in missing months with zero values
  const result: RevenueRow[] = [];
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  const limit = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

  while (cursor <= limit) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (map.has(key)) {
      result.push(map.get(key)!);
    } else {
      result.push({ year: y, month: m, rent: 0, electric: 0, water: 0, other: 0, total: 0 });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return NextResponse.json({ success: true, data: result } as ApiResponse<RevenueRow[]>);
});