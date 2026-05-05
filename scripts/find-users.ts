void (async () => {
  const { prisma } = await import('../src/lib/db/client.ts');
  if (!prisma) { console.error('prisma is undefined'); process.exit(1); }
  const users = await prisma.user.findMany({ select: { id: true, username: true, role: true } });
  console.log(JSON.stringify(users, null, 2));
})();
