const { PrismaClient } = require('@prisma/client');

async function test() {
  const p = new PrismaClient();

  // Simulate what the route does exactly
  const where = {};

  // Test 1: Simple query
  console.log('Test 1: simple findMany');
  try {
    const r1 = await p.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    console.log('  OK, rows:', r1.length);
  } catch (e) {
    console.log('  FAIL:', e.code, e.message.split('\n')[0]);
  }

  // Test 2: With count
  console.log('Test 2: findMany + count');
  try {
    const [rows, total] = await Promise.all([
      p.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      p.auditLog.count({ where }),
    ]);
    console.log('  OK, rows:', rows.length, 'total:', total);
  } catch (e) {
    console.log('  FAIL:', e.code, e.message.split('\n')[0]);
  }

  // Test 3: Check sequenceNum range
  console.log('Test 3: Check sequenceNum values');
  try {
    const rows = await p.auditLog.findMany({
      select: { sequenceNum: true, action: true, entityType: true },
      orderBy: { sequenceNum: 'desc' },
      take: 5
    });
    console.log('  OK, rows:', rows.length);
    rows.forEach(r => console.log('  ', r.sequenceNum.toString(), r.action, r.entityType));
  } catch (e) {
    console.log('  FAIL:', e.code, e.message.split('\n')[0]);
  }

  // Test 4: Try with Prisma json filter
  console.log('Test 4: Try query with details filter');
  try {
    const rows = await p.auditLog.findMany({
      where: { details: { not: null } },
      take: 3
    });
    console.log('  OK, rows:', rows.length);
  } catch (e) {
    console.log('  FAIL:', e.code, e.message.split('\n')[0]);
  }

  await p.$disconnect();
}

test().catch(e => { console.error(e.message); process.exit(1); });