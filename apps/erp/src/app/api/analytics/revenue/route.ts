import { NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';

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

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const now = Date.now();
  if (cache && cache.expiry > now) {
    return NextResponse.json({ success: true, data: cache.value } as ApiResponse<RevenuePoint[]>);
  }

  const months = last12Months(new Date());
  const whereOr = months.map((m) => ({ year: m.year, month: m.month }));
  const grouped = await prisma.invoice.groupBy({
    by: ['year', 'month'],
    where: {
      status: 'PAID',
      OR: whereOr,
    },
    _sum: { totalAmount: true },
  });

  const map = new Map<string, number>();
  for (const g of grouped) {
    const key = `${g.year}-${g.month}`;
    map.set(key, Number(g._sum.totalAmount ?? 0));
  }

  const result: RevenuePoint[] = months.map((m) => {
    const key = `${m.year}-${m.month}`;
    return { year: m.year, month: m.month, total: map.get(key) ?? 0 };
    });

  cache = { value: result, expiry: now + CACHE_TTL_MS };
  return NextResponse.json({ success: true, data: result } as ApiResponse<RevenuePoint[]>);
});
