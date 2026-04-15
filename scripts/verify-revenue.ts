import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;

  const paidThisMonth = await p.invoice.aggregate({
    where: { status: 'PAID', year, month },
    _sum: { totalAmount: true },
    _count: true,
  });

  const billedThisMonth = await p.roomBilling.aggregate({
    where: { billingPeriod: { year, month } },
    _sum: { totalDue: true },
    _count: true,
  });

  // Last 6 months revenue
  const last6 = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const agg = await p.invoice.aggregate({
      where: { status: 'PAID', year: y, month: m },
      _sum: { totalAmount: true },
      _count: true,
    });
    last6.push({ year: y, month: m, paidCount: agg._count, paidSum: Number(agg._sum.totalAmount ?? 0) });
  }

  console.log(JSON.stringify({
    today: today.toISOString(),
    year, month,
    paidThisMonth: { count: paidThisMonth._count, sum: Number(paidThisMonth._sum.totalAmount ?? 0) },
    billedThisMonth: { count: billedThisMonth._count, sum: Number(billedThisMonth._sum.totalDue ?? 0) },
    last6,
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
