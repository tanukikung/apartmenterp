import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const [docTotal, docByType, msgTemplates] = await Promise.all([
    p.documentTemplate.count(),
    p.documentTemplate.groupBy({
      by: ['type'],
      _count: { _all: true },
    }),
    p.messageTemplate.count().catch(() => -1),
  ]);

  const docs = await p.documentTemplate.findMany({
    select: { id: true, type: true, name: true, status: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(JSON.stringify({
    documentTemplates: { total: docTotal, byType: docByType, list: docs },
    messageTemplates: msgTemplates,
  }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
