import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';

const prisma = new PrismaClient();

async function main() {
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'Owner@12345';
  const staffPassword = process.env.SEED_STAFF_PASSWORD || 'Staff@12345';

  console.log('Seeding database...');

  const building = await prisma.building.upsert({
    where: { id: 'seed-building-main' },
    update: {
      name: 'Apartment Building',
      address: '123 Main Street',
      totalFloors: 8,
    },
    create: {
      id: 'seed-building-main',
      name: 'Apartment Building',
      address: '123 Main Street',
      totalFloors: 8,
    },
  });
  console.log(`Created building: ${building.name}`);

  const floors = [];
  for (let i = 1; i <= 8; i++) {
    const floor = await prisma.floor.upsert({
      where: {
        buildingId_floorNumber: {
          buildingId: building.id,
          floorNumber: i,
        },
      },
      update: {},
      create: {
        buildingId: building.id,
        floorNumber: i,
      },
    });
    floors.push(floor);
  }
  console.log(`Created ${floors.length} floors`);

  const roomsPerFloor = [30, 30, 30, 30, 30, 30, 30, 29];
  let totalRooms = 0;

  for (let floorIndex = 0; floorIndex < floors.length; floorIndex++) {
    const floor = floors[floorIndex];
    const roomCount = roomsPerFloor[floorIndex];

    for (let roomNum = 1; roomNum <= roomCount; roomNum++) {
      const roomNumber = `${floor.floorNumber}${roomNum.toString().padStart(2, '0')}`;
      await prisma.room.upsert({
        where: {
          floorId_roomNumber: {
            floorId: floor.id,
            roomNumber,
          },
        },
        update: {
          status: 'VACANT',
          maxResidents: 2,
        },
        create: {
          floorId: floor.id,
          roomNumber,
          status: 'VACANT',
          maxResidents: 2,
        },
      });
      totalRooms += 1;
    }
  }
  console.log(`Created ${totalRooms} rooms`);

  const billingItemTypes = [
    { code: 'RENT', name: 'Monthly Rent', description: 'Base monthly rent', isRecurring: true },
    { code: 'ELECTRIC', name: 'Electricity', description: 'Electricity usage', isRecurring: true },
    { code: 'WATER', name: 'Water', description: 'Water usage', isRecurring: true },
    { code: 'PARKING', name: 'Parking Fee', description: 'Monthly parking', isRecurring: true, defaultAmount: 500 },
    { code: 'FACILITY', name: 'Facility Fee', description: 'Common area maintenance', isRecurring: true, defaultAmount: 300 },
    { code: 'FEE_LATE', name: 'Late Fee', description: 'Late payment penalty', isRecurring: false, defaultAmount: 200 },
    { code: 'FEE_OTHER', name: 'Other Fee', description: 'Miscellaneous fees', isRecurring: false },
  ];

  for (const type of billingItemTypes) {
    await prisma.billingItemType.upsert({
      where: { code: type.code },
      update: {
        name: type.name,
        description: type.description,
        isRecurring: type.isRecurring,
        defaultAmount: type.defaultAmount,
      },
      create: type,
    });
  }
  console.log('Created billing item types');

  const configs = [
    { key: 'billing.billingDay', value: 1, description: 'Day of month billing generated' },
    { key: 'billing.dueDay', value: 5, description: 'Payment due day' },
    { key: 'billing.overdueDay', value: 15, description: 'Day after which considered overdue' },
    { key: 'setup.complete', value: true, description: 'Whether setup wizard completed' },
  ];

  for (const config of configs) {
    await prisma.config.upsert({
      where: { key: config.key },
      update: {
        value: config.value,
        description: config.description,
      },
      create: config,
    });
  }
  console.log('Created initial config');

  // Bank accounts
  const bankAccounts = [
    {
      id: 'seed-bank-scb-main',
      code: 'SCB_MAIN',
      bankName: 'ธนาคารไทยพาณิชย์ (SCB)',
      accountName: 'บริษัท อพาร์ทเมนท์ จำกัด',
      accountNumber: '123-456789-0',
      promptpayId: '0812345678',
      isDefault: true,
      isActive: true,
    },
    {
      id: 'seed-bank-kbank-alt',
      code: 'KBANK_ALT',
      bankName: 'ธนาคารกสิกรไทย (KBANK)',
      accountName: 'บริษัท อพาร์ทเมนท์ จำกัด',
      accountNumber: '987-654321-0',
      promptpayId: null,
      isDefault: false,
      isActive: true,
    },
  ];

  for (const ba of bankAccounts) {
    await prisma.bankAccount.upsert({
      where: { code: ba.code },
      update: {
        bankName: ba.bankName,
        accountName: ba.accountName,
        accountNumber: ba.accountNumber,
        promptpayId: ba.promptpayId,
        isDefault: ba.isDefault,
        isActive: ba.isActive,
      },
      create: ba,
    });
  }
  console.log('Created bank accounts');

  const owner = await prisma.adminUser.upsert({
    where: { username: 'owner' },
    update: {
      displayName: 'System Owner',
      email: 'owner@apartment.local',
      role: 'ADMIN',
      isActive: true,
      forcePasswordChange: false,
      passwordHash: hashPassword(ownerPassword),
    },
    create: {
      username: 'owner',
      displayName: 'System Owner',
      email: 'owner@apartment.local',
      role: 'ADMIN',
      isActive: true,
      forcePasswordChange: false,
      passwordHash: hashPassword(ownerPassword),
    },
  });

  const staff = await prisma.adminUser.upsert({
    where: { username: 'staff' },
    update: {
      displayName: 'Front Desk Staff',
      email: 'staff@apartment.local',
      role: 'STAFF',
      isActive: true,
      forcePasswordChange: true,
      passwordHash: hashPassword(staffPassword),
    },
    create: {
      username: 'staff',
      displayName: 'Front Desk Staff',
      email: 'staff@apartment.local',
      role: 'STAFF',
      isActive: true,
      forcePasswordChange: true,
      passwordHash: hashPassword(staffPassword),
    },
  });

  console.log('Seeded access accounts:');
  console.log(`Owner -> username: ${owner.username} | password: ${ownerPassword}`);
  console.log(`Staff -> username: ${staff.username} | password: ${staffPassword} (forced password change on first sign-in)`);
  console.log('Seeding completed');
}

main()
  .catch((error) => {
    console.error('Seeding error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
