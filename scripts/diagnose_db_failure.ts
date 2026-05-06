/**
 * Precise diagnostic: identify exactly which query fails
 * Run with: npx ts-node scripts/diagnose_failure.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error', 'warn', 'query'],
});

async function testQuery(label: string, fn: () => Promise<unknown>) {
  try {
    console.log(`\n=== Testing: ${label} ===`);
    const result = await fn();
    console.log(`✅ SUCCESS`);
    return result;
  } catch (e: any) {
    console.log(`❌ FAILED: ${e?.message}`);
    if (e?.code) console.log(`   Code: ${e.code}`);
    if (e?.clientVersion) console.log(`   Client: ${e.clientVersion}`);
    return null;
  }
}

async function main() {
  console.log('Database URL:', process.env.DATABASE_URL?.substring(0, 30) + '...');

  // Test 1: probeAuditChainIntegrity last row
  await testQuery('probeAuditChainIntegrity last row', async () => {
    return prisma.$queryRawUnsafe(`
      SELECT sequence_num, event_hash, prev_hash
      FROM audit_logs
      ORDER BY sequence_num DESC
      LIMIT 1
    `);
  });

  // Test 2: probeAuditChainIntegrity previous row
  await testQuery('probeAuditChainIntegrity previous row', async () => {
    return prisma.$queryRawUnsafe(`
      SELECT event_hash FROM audit_logs WHERE sequence_num = $1 LIMIT 1
    `, [BigInt(1)]);
  });

  // Test 3: rooms fix-status orphaned query
  await testQuery('rooms fix-status orphaned', async () => {
    return prisma.$queryRawUnsafe<{ roomNo: string }[]>(`
      SELECT r."roomNo"
      FROM rooms r
      WHERE r."roomStatus" = 'OCCUPIED'
        AND NOT EXISTS (
          SELECT 1 FROM "RoomTenant" rt
          WHERE rt."roomNo" = r."roomNo" AND rt."moveOutDate" IS NULL
        )
    `);
  });

  // Test 4: Simple raw query on rooms
  await testQuery('simple rooms query', async () => {
    return prisma.$queryRawUnsafe<{ roomNo: string }[]>(`
      SELECT "roomNo" FROM rooms LIMIT 5
    `);
  });

  // Test 5: Check RoomTenant table exists
  await testQuery('RoomTenant query', async () => {
    return prisma.$queryRawUnsafe<{ roomNo: string }[]>(`
      SELECT "roomNo" FROM "RoomTenant" LIMIT 5
    `);
  });

  // Test 6: Check roomTenants table name
  await testQuery('room_tenants query (actual DB table)', async () => {
    return prisma.$queryRawUnsafe<{ roomNo: string }[]>(`
      SELECT "roomNo" FROM room_tenants LIMIT 5
    `);
  });

  // Test 7: Verify roomTenants soft-delete
  await testQuery('RoomTenant with soft-delete filter', async () => {
    return prisma.roomTenant.findMany({ take: 5 });
  });

  // Test 8: Check raw query without mapping
  await testQuery('rooms with simple findMany', async () => {
    return prisma.room.findMany({ take: 3 });
  });

  // Test 9: Rooms status check
  await testQuery('rooms fix-status with RoomTenant mapping', async () => {
    return prisma.$queryRawUnsafe<{ roomNo: string }[]>(`
      SELECT r."roomNo"
      FROM rooms r
      WHERE r."roomStatus" = 'OCCUPIED'
        AND NOT EXISTS (
          SELECT 1 FROM "roomTenants" rt
          WHERE rt."roomNo" = r."roomNo" AND rt."moveOutDate" IS NULL
        )
    `);
  });

  await prisma.$disconnect();
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
