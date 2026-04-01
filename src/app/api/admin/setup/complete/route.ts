import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { asyncHandler, ApiResponse, ConflictError } from '@/lib/utils/errors';
// ============================================================================
// Validation Schema
// ============================================================================

const lineNotifySchema = z.object({
  enabled: z.boolean(),
  channelId: z.string().optional(),
  channelSecret: z.string().optional(),
  accessToken: z.string().optional(),
}).nullable();

const emailNotifySchema = z.object({
  enabled: z.boolean(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  fromEmail: z.string().optional(),
}).nullable();

const setupCompleteSchema = z.object({
  admin: z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, dots, underscores, and hyphens'),
    displayName: z.string().min(2).max(100),
    password: z.string().min(8).max(128),
  }),
  building: z.object({
    name: z.string().min(1).max(200),
    address: z.string().min(1).max(500),
    phone: z.string().min(1).max(20),
    email: z.string().email().optional().or(z.literal('')),
    taxId: z.string().min(1).max(20).optional().or(z.literal('')),
  }),
  billing: z.object({
    billingDay: z.number().int().min(1).max(28),
    dueDay: z.number().int().min(1).max(31),
    reminderDays: z.number().int().min(0).max(30).default(3),
    lateFeePerDay: z.number().min(0).default(10),
  }),
  lineNotify: lineNotifySchema,
  emailNotify: emailNotifySchema,
}).strict();

// ============================================================================
// Hardcoded 239-room layout (8 floors, fixed)
// ============================================================================

type RoomDef = { roomNo: string; floorNo: number; accountId: string; rent: number };

const HARDCODED_ROOMS: RoomDef[] = [
  // Floor 1 — 15 rooms
  { roomNo: '798/1',  floorNo: 1, accountId: 'ACC_F1', rent: 15500 },
  { roomNo: '798/2',  floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/3',  floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/4',  floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/5',  floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/6',  floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/7',  floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/8',  floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/9',  floorNo: 1, accountId: 'ACC_F1', rent: 6500 },
  { roomNo: '798/10', floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/11', floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/12', floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/13', floorNo: 1, accountId: 'ACC_F1', rent: 5900 },
  { roomNo: '798/14', floorNo: 1, accountId: 'ACC_F1', rent: 5000 },
  { roomNo: '798/15', floorNo: 1, accountId: 'ACC_F1', rent: 5000 },
  // Floors 2–8 — 32 rooms each
  ...Array.from({ length: 7 }, (_, fi) => {
    const floor = fi + 2;
    const base = (30 + floor) * 100;
    return Array.from({ length: 32 }, (_, ri) => ({
      roomNo: String(base + ri + 1),
      floorNo: floor,
      accountId: `ACC_F${floor}`,
      rent: 2900,
    }));
  }).flat(),
];

// ============================================================================
// Billing Rules to create
// ============================================================================

const BILLING_RULES = [
  {
    code: 'STANDARD',
    descriptionTh: 'มาตรฐาน',
    waterEnabled: true,
    waterUnitPrice: 20,
    waterMinCharge: 100,
    waterServiceFeeMode: 'FLAT_ROOM' as const,
    waterServiceFeeAmount: 20,
    electricEnabled: true,
    electricUnitPrice: 9,
    electricMinCharge: 45,
    electricServiceFeeMode: 'FLAT_ROOM' as const,
    electricServiceFeeAmount: 20,
  },
  {
    code: 'NO_WATER',
    descriptionTh: 'ไม่มีน้ำ',
    waterEnabled: false,
    waterUnitPrice: 0,
    waterMinCharge: 0,
    waterServiceFeeMode: 'NONE' as const,
    waterServiceFeeAmount: 0,
    electricEnabled: true,
    electricUnitPrice: 8,
    electricMinCharge: 0,
    electricServiceFeeMode: 'NONE' as const,
    electricServiceFeeAmount: 0,
  },
  {
    code: 'NO_ELECTRIC',
    descriptionTh: 'ไม่มีไฟฟ้า',
    waterEnabled: true,
    waterUnitPrice: 20,
    waterMinCharge: 100,
    waterServiceFeeMode: 'FLAT_ROOM' as const,
    waterServiceFeeAmount: 20,
    electricEnabled: false,
    electricUnitPrice: 0,
    electricMinCharge: 0,
    electricServiceFeeMode: 'NONE' as const,
    electricServiceFeeAmount: 0,
  },
];

// ============================================================================
// POST /api/admin/setup/complete
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await setupCompleteSchema.parse(await req.json());

  // Check if already initialized
  const existingInit = await prisma.config.findUnique({ where: { key: 'system.initialized' } });
  if (existingInit?.value === true) {
    throw new ConflictError('System is already initialized');
  }

  // Double-check: ensure no admin user exists yet (prevents race condition where
  // two simultaneous requests both pass the initialized check before either commits)
  const adminCount = await prisma.adminUser.count();
  if (adminCount > 0) {
    throw new ConflictError('System is already initialized');
  }

  // Check for duplicate username
  const existingUser = await prisma.adminUser.findFirst({
    where: { username: { equals: body.admin.username, mode: 'insensitive' } },
  });
  if (existingUser) {
    throw new ConflictError('Username is already in use');
  }

  // Bank accounts — one per floor (8 floors)
  const bankAccounts = Array.from({ length: 8 }, (_, i) => ({
    id: `ACC_F${i + 1}`,
    name: `Floor ${i + 1} Account`,
    bankName: 'ธนาคารกสิกรไทย',
    bankAccountNo: `000-0-${String(i + 1).padStart(5, '0')}`,
    promptpay: null,
    active: true,
  }));

  // Run everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create admin user
    const adminUser = await tx.adminUser.create({
      data: {
        username: body.admin.username.toLowerCase(),
        displayName: body.admin.displayName.trim(),
        passwordHash: hashPassword(body.admin.password),
        role: 'ADMIN',
        forcePasswordChange: false, // Set to false for easier testing; in production, set to true
      },
      select: { id: true, username: true, displayName: true, role: true },
    });

    // 2. Create billing rules
    await tx.billingRule.createMany({
      data: BILLING_RULES.map((rule) => ({
        ...rule,
        waterUnitPrice: rule.waterUnitPrice,
        waterMinCharge: rule.waterMinCharge,
        waterServiceFeeAmount: rule.waterServiceFeeAmount,
        electricUnitPrice: rule.electricUnitPrice,
        electricMinCharge: rule.electricMinCharge,
        electricServiceFeeAmount: rule.electricServiceFeeAmount,
      })),
      skipDuplicates: true,
    });

    // 3. Create bank accounts
    for (const acc of bankAccounts) {
      await tx.bankAccount.upsert({
        where: { id: acc.id },
        update: { name: acc.name, bankName: acc.bankName, bankAccountNo: acc.bankAccountNo, active: acc.active },
        create: acc,
      });
    }

    // 4. Create rooms (hardcoded 239-room layout)
    const roomsToCreate = HARDCODED_ROOMS.map((r) => ({
      roomNo: r.roomNo,
      floorNo: r.floorNo,
      defaultAccountId: r.accountId,
      defaultRuleCode: 'STANDARD',
      defaultRentAmount: r.rent,
      hasFurniture: false,
      defaultFurnitureAmount: 0,
      roomStatus: 'VACANT' as const,
    }));

    // Batch create rooms in chunks of 100
    for (let i = 0; i < roomsToCreate.length; i += 100) {
      await tx.room.createMany({
        data: roomsToCreate.slice(i, i + 100),
        skipDuplicates: true,
      });
    }

    // 5. Create building config
    await tx.config.upsert({
      where: { key: 'building.name' },
      update: { value: body.building.name },
      create: { key: 'building.name', value: body.building.name, description: 'Building name' },
    });
    await tx.config.upsert({
      where: { key: 'building.address' },
      update: { value: body.building.address },
      create: { key: 'building.address', value: body.building.address, description: 'Building address' },
    });
    await tx.config.upsert({
      where: { key: 'building.phone' },
      update: { value: body.building.phone },
      create: { key: 'building.phone', value: body.building.phone, description: 'Building phone' },
    });
    await tx.config.upsert({
      where: { key: 'building.email' },
      update: { value: body.building.email },
      create: { key: 'building.email', value: body.building.email, description: 'Building email' },
    });
    await tx.config.upsert({
      where: { key: 'building.taxId' },
      update: { value: body.building.taxId },
      create: { key: 'building.taxId', value: body.building.taxId, description: 'Building tax ID' },
    });

    // 6. Create billing policy config
    await tx.config.upsert({
      where: { key: 'billing.billingDay' },
      update: { value: body.billing.billingDay },
      create: { key: 'billing.billingDay', value: body.billing.billingDay, description: 'Billing day of month' },
    });
    await tx.config.upsert({
      where: { key: 'billing.dueDay' },
      update: { value: body.billing.dueDay },
      create: { key: 'billing.dueDay', value: body.billing.dueDay, description: 'Invoice due day of month' },
    });
    await tx.config.upsert({
      where: { key: 'billing.reminderDays' },
      update: { value: body.billing.reminderDays },
      create: { key: 'billing.reminderDays', value: body.billing.reminderDays, description: 'Days before due date to send reminder' },
    });
    await tx.config.upsert({
      where: { key: 'billing.lateFeePerDay' },
      update: { value: body.billing.lateFeePerDay },
      create: { key: 'billing.lateFeePerDay', value: body.billing.lateFeePerDay, description: 'Late fee per day in baht' },
    });

    // 7. Store LINE notify config if enabled
    if (body.lineNotify?.enabled) {
      await tx.config.upsert({
        where: { key: 'lineNotify.enabled' },
        update: { value: true },
        create: { key: 'lineNotify.enabled', value: true, description: 'LINE notify enabled' },
      });
      if (body.lineNotify.channelId) {
        await tx.config.upsert({
          where: { key: 'lineNotify.channelId' },
          update: { value: body.lineNotify.channelId },
          create: { key: 'lineNotify.channelId', value: body.lineNotify.channelId, description: 'LINE Channel ID' },
        });
      }
      if (body.lineNotify.channelSecret) {
        await tx.config.upsert({
          where: { key: 'lineNotify.channelSecret' },
          update: { value: body.lineNotify.channelSecret },
          create: { key: 'lineNotify.channelSecret', value: body.lineNotify.channelSecret, description: 'LINE Channel Secret' },
        });
      }
      if (body.lineNotify.accessToken) {
        await tx.config.upsert({
          where: { key: 'lineNotify.accessToken' },
          update: { value: body.lineNotify.accessToken },
          create: { key: 'lineNotify.accessToken', value: body.lineNotify.accessToken, description: 'LINE Access Token' },
        });
      }
    }

    // 8. Store email notify config if enabled
    if (body.emailNotify?.enabled) {
      await tx.config.upsert({
        where: { key: 'emailNotify.enabled' },
        update: { value: true },
        create: { key: 'emailNotify.enabled', value: true, description: 'Email notify enabled' },
      });
      if (body.emailNotify.smtpHost) {
        await tx.config.upsert({
          where: { key: 'emailNotify.smtpHost' },
          update: { value: body.emailNotify.smtpHost },
          create: { key: 'emailNotify.smtpHost', value: body.emailNotify.smtpHost, description: 'SMTP host' },
        });
      }
      if (body.emailNotify.smtpPort) {
        await tx.config.upsert({
          where: { key: 'emailNotify.smtpPort' },
          update: { value: body.emailNotify.smtpPort },
          create: { key: 'emailNotify.smtpPort', value: body.emailNotify.smtpPort, description: 'SMTP port' },
        });
      }
      if (body.emailNotify.smtpUser) {
        await tx.config.upsert({
          where: { key: 'emailNotify.smtpUser' },
          update: { value: body.emailNotify.smtpUser },
          create: { key: 'emailNotify.smtpUser', value: body.emailNotify.smtpUser, description: 'SMTP user' },
        });
      }
      if (body.emailNotify.smtpPass) {
        await tx.config.upsert({
          where: { key: 'emailNotify.smtpPass' },
          update: { value: body.emailNotify.smtpPass },
          create: { key: 'emailNotify.smtpPass', value: body.emailNotify.smtpPass, description: 'SMTP password' },
        });
      }
      if (body.emailNotify.fromEmail) {
        await tx.config.upsert({
          where: { key: 'emailNotify.fromEmail' },
          update: { value: body.emailNotify.fromEmail },
          create: { key: 'emailNotify.fromEmail', value: body.emailNotify.fromEmail, description: 'From email address' },
        });
      }
    }

    // 9. Mark system as initialized
    await tx.config.upsert({
      where: { key: 'system.initialized' },
      update: { value: true },
      create: { key: 'system.initialized', value: true, description: 'System initialization flag' },
    });

    return {
      adminUserId: adminUser.id,
      roomsCreated: roomsToCreate.length,
      floorsCreated: 8,
    };
  });

  return NextResponse.json({
    success: true,
    data: result,
    message: 'System setup completed successfully',
  } as ApiResponse<typeof result>, { status: 201 });
});
