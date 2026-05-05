import { prisma } from '@/lib/db/client';

async function main() {
  const users = await prisma.adminUser.findMany({ select: { id: true, username: true, role: true, isActive: true } });
  console.log('All admin users:', JSON.stringify(users, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });