import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { requireRole } from '@/lib/auth/guards';

type RevenuePoint = { year: number; month: number; total: number };

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: RevenuePoint[]; expiry: number } | null = null;

function last12Months(ref: Date): Array<{ year: number; month: number }> {
  const list: Array<{ year: number; month: number }> = [];
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  for (let i = 11; i >= 0; i--) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    list.push({ year: x.getUTCFullYear(), month: x.getUTCMonth() + 1 });
  }
  return list;
}

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);
  const now = Date.now();
  if (cache && cache.expiry > now) {
    return NextResponse.json({ success: true, data: cache.value } as ApiResponse<RevenuePoint[]>);
  }

  const months = last12Months(new Date());
  const startDate = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const endDate = new Date(Date.UTC(months[11].year, months[11].month, 0, 23, 59, 59));

  // Get paid invoice revenue grouped by actual paidAt date (not invoice billing period)
  const paidInvoices = await prisma.invoice.findMany({
    where: {
      status: 'PAID',
      paidAt: { gte: startDate, lte: endDate },
    },
    select: { paidAt: true, totalAmount: true },
  });

  // Build paid revenue map keyed by paidAt year-month
  const paidMap = new Map<string, number>();
  for (const inv of paidInvoices) {
    if (!inv.paidAt) continue;
    const d = new Date(inv.paidAt);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
    paidMap.set(key, (paidMap.get(key) ?? 0) + Number(inv.totalAmount));
  }

  // Use paid revenue for months that have payments; fall back to 0 for months with no payments
  const result: RevenuePoint[] = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    return { year: m.year, month: m.month, total: paidMap.get(key) ?? 0 };
  });

  cache = { value: result, expiry: now + CACHE_TTL_MS };
  return NextResponse.json({ success: true, data: result } as ApiResponse<RevenuePoint[]>);
});
