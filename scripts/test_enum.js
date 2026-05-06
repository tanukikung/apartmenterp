const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const period = await prisma.billingPeriod.findFirst({ where: { year: 2025, month: 1 } });
  console.log('Period ID:', period?.id?.slice(0, 8));
  const fixedUuid = '00000000-0000-0000-0000-000000000001';

  // Test 1: Hardcoded $executeRaw with cast
  console.log('Test 1: $executeRaw with hardcoded DRAFT::"RoomBillingStatus"');
  try {
    await prisma.$executeRaw`INSERT INTO "room_billings" ("id", "billingPeriodId", "roomNo", "status") VALUES (${fixedUuid}, ${period.id}, '3201', 'DRAFT'::"RoomBillingStatus")`;
    console.log('  SUCCESS');
    await prisma.$executeRaw`DELETE FROM "room_billings" WHERE id = ${fixedUuid}`;
  } catch (e) {
    console.log('  FAIL:', e.message.split('\n').slice(-1)[0]);
  }

  // Test 2: Prisma.sql with cast
  console.log('Test 2: Prisma.sql with DRAFT::"RoomBillingStatus"');
  const statusSql = 'DRAFT::"RoomBillingStatus"'; // JS string - cast is embedded
  try {
    await prisma.$executeRaw`INSERT INTO "room_billings" ("id", "billingPeriodId", "roomNo", "status") VALUES (${fixedUuid}, ${period.id}, '3201', ${statusSql})`;
    console.log('  SUCCESS');
    await prisma.$executeRaw`DELETE FROM "room_billings" WHERE id = ${fixedUuid}`;
  } catch (e) {
    console.log('  FAIL:', e.message.split('\n').slice(-1)[0]);
  }

  // Test 3: What happens with $queryRaw?
  console.log('Test 3: $queryRaw with RETURNING');
  try {
    const result = await prisma.$queryRaw`INSERT INTO "room_billings" ("id", "billingPeriodId", "roomNo", "status") VALUES (${fixedUuid}, ${period.id}, '3201', 'DRAFT'::"RoomBillingStatus") RETURNING id, status`;
    console.log('  SUCCESS:', JSON.stringify(result));
    await prisma.$executeRaw`DELETE FROM "room_billings" WHERE id = ${fixedUuid}`;
  } catch (e) {
    console.log('  FAIL:', e.message.split('\n').slice(-1)[0]);
  }

  // Test 4: $executeRawUnsafe with text for enum
  console.log('Test 4: $executeRawUnsafe with text for enum');
  try {
    await prisma.$executeRawUnsafe(`INSERT INTO "room_billings" ("id", "billingPeriodId", "roomNo", "status") VALUES ('${fixedUuid}', '${period.id}', '3201', 'DRAFT')`);
    console.log('  SUCCESS');
    await prisma.$executeRaw`DELETE FROM "room_billings" WHERE id = ${fixedUuid}`;
  } catch (e) {
    console.log('  FAIL:', e.message.split('\n').slice(-1)[0]);
  }

  await prisma.$disconnect();
}

test().catch(console.error);