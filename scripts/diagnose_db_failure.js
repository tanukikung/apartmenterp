/**
 * Diagnostic script - plain JS to avoid module issues
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || 'postgresql://postgres:anand37048@localhost:5432/test' }
  },
  log: ['error', 'warn', 'query'],
});

async function testQuery(label, fn) {
  try {
    console.log(`\n=== Testing: ${label} ===`);
    const result = await fn();
    console.log(`✅ SUCCESS`);
    return result;
  } catch (e) {
    console.log(`❌ FAILED: ${e?.message}`);
    if (e?.code) console.log(`   Code: ${e.code}`);
    return null;
  }
}

async function main() {
  // Test 1: probeAuditChainIntegrity previous row with correct type casting
  await testQuery('probeAuditChainIntegrity previous row (corrected)', async () => {
    return prisma.$queryRawUnsafe(`
      SELECT event_hash FROM audit_logs WHERE sequence_num = $1 LIMIT 1
    `, BigInt(1));
  });

  // Test 2: rooms fix-status orphaned query with correct table name
  await testQuery('rooms fix-status orphaned (corrected)', async () => {
    return prisma.$queryRawUnsafe(`
      SELECT r."roomNo"
      FROM rooms r
      WHERE r."roomStatus" = 'OCCUPIED'
        AND NOT EXISTS (
          SELECT 1 FROM room_tenants rt
          WHERE rt."roomNo" = r."roomNo" AND rt."moveOutDate" IS NULL
        )
    `);
  });

  await prisma.$disconnect();
  console.log('\nDone');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
