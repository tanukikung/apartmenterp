import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const [txTotal, pending, autoMatched, needReview, matched] = await Promise.all([
    p.paymentTransaction.count(),
    p.paymentTransaction.count({ where: { status: 'PENDING' } }),
    p.paymentTransaction.count({ where: { status: 'AUTO_MATCHED' } }),
    p.paymentTransaction.count({ where: { status: 'NEED_REVIEW' } }),
    p.paymentTransaction.count({ where: { status: 'CONFIRMED' } }).catch(() => -1),
  ]);

  console.log(JSON.stringify({
    paymentTransactions: { total: txTotal, pending, autoMatched, needReview, confirmed: matched },
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
