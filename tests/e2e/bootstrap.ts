/**
 * Test Bootstrap — creates minimal baseline data so tests run on an empty DB.
 *
 * This replaces the dependency on `prisma/seed.ts` for E2E testing.
 * It uses Prisma directly (bypasses API auth) to create the minimum
 * infrastructure needed by the API layer:
 *   - Bank account (required by room.defaultAccountId)
 *   - Billing rule  (required by room.defaultRuleCode)
 *   - 8 rooms across 2 floors (seeded rooms for billing tests)
 *   - 2 admin users: owner + staff (same credentials as seed)
 *
 * IMPORTANT: Only run in test environment. Guarded by NODE_ENV=test.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword } from '../../src/lib/auth/password';

async function bootstrap() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test bootstrap can only run in test environment');
  }

  const prisma = new PrismaClient();
  const created: string[] = [];

  try {
    // ── Bank Account ───────────────────────────────────────────────────────────
    const bankAccount = await prisma.bankAccount.upsert({
      where: { id: 'seed-bank-001' },
      update: {},
      create: {
        id: 'seed-bank-001',
        name: 'Test Bank',
        bankName: 'Test Bank',
        bankAccountNo: '1234567890',
        promptpay: '0812345678',
        active: true,
      },
    });
    created.push(`bankAccount:${bankAccount.id}`);

    // ── Billing Rule ──────────────────────────────────────────────────────────
    const billingRule = await prisma.billingRule.upsert({
      where: { code: 'seed-rule-001' },
      update: {},
      create: {
        code: 'seed-rule-001',
        descriptionTh: 'Test Billing Rule',
        waterEnabled: true,
        waterUnitPrice: new Prisma.Decimal(15),
        waterMinCharge: new Prisma.Decimal(50),
        waterServiceFeeMode: 'PER_UNIT',
        waterServiceFeeAmount: new Prisma.Decimal(5),
        electricEnabled: true,
        electricUnitPrice: new Prisma.Decimal(4.5),
        electricMinCharge: new Prisma.Decimal(100),
        electricServiceFeeMode: 'PER_UNIT',
        electricServiceFeeAmount: new Prisma.Decimal(5),
        penaltyPerDay: new Prisma.Decimal(20),
        maxPenalty: new Prisma.Decimal(500),
        gracePeriodDays: 3,
        commonAreaWaterEnabled: false,
      },
    });
    created.push(`billingRule:${billingRule.code}`);

    // ── Rooms: 2 floors × 4 rooms = 8 rooms (same layout as seed but minimal) ─
    const floors = [3, 4];
    const roomsPerFloor = 4;
    const seededRooms: string[] = [];

    for (const floor of floors) {
      for (let i = 1; i <= roomsPerFloor; i++) {
        const roomNo = `${floor}20${i}`;
        const room = await prisma.room.upsert({
          where: { roomNo },
          update: {},
          create: {
            roomNo,
            floorNo: floor,
            defaultAccountId: bankAccount.id,
            defaultRuleCode: billingRule.code,
            defaultRentAmount: new Prisma.Decimal(floor === 3 ? 12000 : 15000),
            hasFurniture: floor === 3,
            defaultFurnitureAmount: new Prisma.Decimal(floor === 3 ? 2000 : 0),
            roomStatus: 'VACANT',
            maxResidents: 2,
          },
        });
        seededRooms.push(roomNo);
      }
    }
    created.push(`rooms:${seededRooms.join(',')}`);

    // ── Admin Users ──────────────────────────────────────────────────────────
    const ownerHash = hashPassword('Owner@12345');
    const staffHash = hashPassword('Staff@12345');

    await prisma.adminUser.upsert({
      where: { username: 'owner' },
      update: {},
      create: {
        id: 'seed-owner-001',
        username: 'owner',
        email: 'owner@test.local',
        displayName: 'Test Owner',
        role: 'OWNER',
        passwordHash: ownerHash,
        isActive: true,
        forcePasswordChange: false,
      },
    });
    created.push('adminUser:owner');

    await prisma.adminUser.upsert({
      where: { username: 'staff' },
      update: {},
      create: {
        id: 'seed-staff-001',
        username: 'staff',
        email: 'staff@test.local',
        displayName: 'Test Staff',
        role: 'STAFF',
        passwordHash: staffHash,
        isActive: true,
        forcePasswordChange: false,
      },
    });
    created.push('adminUser:staff');

    console.log(`[bootstrap] Created baseline data: ${created.join(' | ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrap().catch((err) => {
  console.error('[bootstrap] FAILED:', err);
  process.exit(1);
});
