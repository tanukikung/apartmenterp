import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Fixing room structure...\n');

  // Delete dependent data first (due to foreign key constraints)
  console.log('Cleaning up dependent records...');

  // Delete in dependency order (cascade-aware)
  // Payment-related records must be deleted before invoices
  await prisma.paymentMatchDecision.deleteMany({});
  await prisma.paymentMatchReview.deleteMany({});
  await prisma.paymentMatch.deleteMany({});
  await prisma.paymentTransaction.deleteMany({});
  await prisma.payment.deleteMany({});

  // Then invoices, which reference room_billings
  await prisma.invoice.deleteMany({});

  // Then billing-related records
  await prisma.billingAuditLog.deleteMany({});
  await prisma.roomBilling.deleteMany({});

  // Then room-tenant relationships
  await prisma.roomTenant.deleteMany({});

  // Then contracts
  await prisma.contract.deleteMany({});

  // Delete all existing rooms
  const deletedCount = await prisma.room.deleteMany({});
  console.log(`✓ Deleted ${deletedCount.count} existing rooms`);

  const rooms: Array<{
    roomNo: string;
    floorNo: number;
    defaultAccountId?: string;
    defaultRuleCode?: string;
    defaultRentAmount: number;
    hasFurniture?: boolean;
    defaultFurnitureAmount?: number;
  }> = [];

  // Get bank accounts and billing rules
  const bankAccounts = await prisma.bankAccount.findMany();
  const billingRules = await prisma.billingRule.findMany();

  const defaultAccountId = bankAccounts[0]?.id || '';
  const defaultRuleCode = billingRules[0]?.code || 'STANDARD';

  // Floor 1: 798/1 to 798/15 (15 rooms)
  for (let i = 1; i <= 15; i++) {
    rooms.push({
      roomNo: `798/${i}`,
      floorNo: 1,
      defaultAccountId,
      defaultRuleCode,
      defaultRentAmount: 12000,
      hasFurniture: true,
      defaultFurnitureAmount: 1500,
    });
  }
  console.log('✓ Floor 1: 798/1-798/15 (15 rooms)');

  // Floors 2-8: Standard numbering (3201-3232, 3301-3332, ... 3801-3832)
  for (let floor = 2; floor <= 8; floor++) {
    const prefix = 3200 + (floor - 2) * 100; // 3200, 3300, 3400, ... 3800

    for (let room = 1; room <= 32; room++) {
      const roomNum = prefix + room;
      rooms.push({
        roomNo: String(roomNum),
        floorNo: floor,
        defaultAccountId,
        defaultRuleCode,
        defaultRentAmount: 12000,
        hasFurniture: true,
        defaultFurnitureAmount: 1500,
      });
    }
    const startNum = prefix + 1;
    const endNum = prefix + 32;
    console.log(`✓ Floor ${floor}: ${startNum}-${endNum} (32 rooms)`);
  }

  // Create all rooms in one transaction
  const created = await prisma.room.createMany({
    data: rooms,
    skipDuplicates: false,
  });

  console.log(`\n✅ Created ${created.count} rooms\n`);
  console.log('📊 Summary:');
  console.log(`   Floor 1: 15 rooms (798/1-15)`);
  console.log(`   Floor 2-8: 32 rooms each (3201-3832)`);
  console.log(`   Total: ${15 + 32 * 7} rooms`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
