const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const docTemplates = await p.documentTemplate.findMany({ take: 5 });
  console.log('docTemplates:', JSON.stringify(docTemplates.map(t => ({ id: t.id, name: t.name, type: t.type }))));
  const msgTemplates = await p.messageTemplate.findMany({ take: 5 });
  console.log('msgTemplates:', JSON.stringify(msgTemplates.map(t => ({ id: t.id, name: t.name, type: t.type }))));
  const migrations = await p.$queryRaw`SELECT migration_name, checksum FROM _prisma_migrations ORDER BY finished_at`;
  console.log('migrations:', JSON.stringify(migrations));
}
main().catch(console.error).finally(() => p.$disconnect());
