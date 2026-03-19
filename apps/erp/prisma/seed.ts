import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';

const prisma = new PrismaClient();

async function main() {
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || 'Owner@12345';
  const staffPassword = process.env.SEED_STAFF_PASSWORD || 'Staff@12345';

  console.log('Seeding database...');

  // ──────────────────────────────────────────────────────────────────────────
  // Admin users
  // ──────────────────────────────────────────────────────────────────────────
  const ownerHash = await hashPassword(ownerPassword);
  const staffHash = await hashPassword(staffPassword);

  await prisma.adminUser.upsert({
    where: { username: 'owner' },
    update: { passwordHash: ownerHash, role: 'ADMIN', isActive: true },
    create: {
      username: 'owner',
      displayName: 'Owner',
      role: 'ADMIN',
      passwordHash: ownerHash,
      isActive: true,
    },
  });

  await prisma.adminUser.upsert({
    where: { username: 'staff' },
    update: { passwordHash: staffHash, role: 'STAFF', isActive: true },
    create: {
      username: 'staff',
      displayName: 'Staff',
      role: 'STAFF',
      passwordHash: staffHash,
      isActive: true,
    },
  });
  console.log('Created admin users: owner, staff');

  // ──────────────────────────────────────────────────────────────────────────
  // Bank accounts — ACC_F1..ACC_F8 (matches Excel ACCOUNTS sheet)
  // ──────────────────────────────────────────────────────────────────────────
  const bankAccounts = [
    { id: 'ACC_F1', name: 'Floor 1 Account', bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '000-0-00001-0', promptpay: null },
    { id: 'ACC_F2', name: 'Floor 2 Account', bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '000-0-00002-0', promptpay: null },
    { id: 'ACC_F3', name: 'Floor 3 Account', bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '000-0-00003-0', promptpay: null },
    { id: 'ACC_F4', name: 'Floor 4 Account', bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '000-0-00004-0', promptpay: null },
    { id: 'ACC_F5', name: 'Floor 5 Account', bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '000-0-00005-0', promptpay: null },
    { id: 'ACC_F6', name: 'Floor 6 Account', bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '000-0-00006-0', promptpay: null },
    { id: 'ACC_F7', name: 'Floor 7 Account', bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '000-0-00007-0', promptpay: null },
    { id: 'ACC_F8', name: 'Floor 8 Account', bankName: 'ธนาคารกสิกรไทย', bankAccountNo: '000-0-00008-0', promptpay: null },
  ];

  for (const acc of bankAccounts) {
    await prisma.bankAccount.upsert({
      where: { id: acc.id },
      update: { name: acc.name, bankName: acc.bankName, bankAccountNo: acc.bankAccountNo, active: true },
      create: { ...acc, active: true },
    });
  }
  console.log('Created 8 bank accounts (ACC_F1..ACC_F8)');

  // ──────────────────────────────────────────────────────────────────────────
  // Billing rules — matches Excel RULES sheet (exact values)
  // ──────────────────────────────────────────────────────────────────────────
  const billingRules = [
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
      waterUnitPrice: 18,
      waterMinCharge: 0,
      waterServiceFeeMode: 'FLAT_ROOM' as const,
      waterServiceFeeAmount: 50,
      electricEnabled: false,
      electricUnitPrice: 0,
      electricMinCharge: 0,
      electricServiceFeeMode: 'NONE' as const,
      electricServiceFeeAmount: 0,
    },
    {
      code: 'WATER_SERVICE_PER_UNIT',
      descriptionTh: 'ค่าบริการน้ำต่อหน่วย',
      waterEnabled: true,
      waterUnitPrice: 18,
      waterMinCharge: 0,
      waterServiceFeeMode: 'PER_UNIT' as const,
      waterServiceFeeAmount: 2,
      electricEnabled: true,
      electricUnitPrice: 8,
      electricMinCharge: 0,
      electricServiceFeeMode: 'FLAT_ROOM' as const,
      electricServiceFeeAmount: 0,
    },
  ];

  for (const rule of billingRules) {
    await prisma.billingRule.upsert({
      where: { code: rule.code },
      update: rule,
      create: rule,
    });
  }
  console.log('Created 4 billing rules');

  // ──────────────────────────────────────────────────────────────────────────
  // Rooms — ALL 239 rooms from ROOM_MASTER
  // Format: { roomNo, floorNo, accountId, rent }
  // All rooms default to STANDARD rule unless otherwise specified
  // ──────────────────────────────────────────────────────────────────────────

  type RoomSeed = {
    roomNo: string;
    floorNo: number;
    accountId: string;
    rent: number;
    hasFurniture?: boolean;
    furnitureAmount?: number;
  };

  const rooms: RoomSeed[] = [
    // Floor 1 — 15 rooms, account ACC_F1
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

    // Floor 2 — 32 rooms, account ACC_F2
    { roomNo: '3201', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3202', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3203', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3204', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3205', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3206', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3207', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3208', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3209', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3210', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3211', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3212', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3213', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3214', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3215', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3216', floorNo: 2, accountId: 'ACC_F2', rent: 2200 },
    { roomNo: '3217', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3218', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3219', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3220', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3221', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3222', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3223', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3224', floorNo: 2, accountId: 'ACC_F2', rent: 3300 },
    { roomNo: '3225', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3226', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3227', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3228', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3229', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3230', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },
    { roomNo: '3231', floorNo: 2, accountId: 'ACC_F2', rent: 2400 },
    { roomNo: '3232', floorNo: 2, accountId: 'ACC_F2', rent: 2900 },

    // Floor 3 — 32 rooms, account ACC_F3
    { roomNo: '3301', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3302', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3303', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3304', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3305', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3306', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3307', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3308', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3309', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3310', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3311', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3312', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3313', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3314', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3315', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3316', floorNo: 3, accountId: 'ACC_F3', rent: 2200 },
    { roomNo: '3317', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3318', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3319', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3320', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3321', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3322', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3323', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3324', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3325', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3326', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3327', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3328', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3329', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3330', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3331', floorNo: 3, accountId: 'ACC_F3', rent: 2900 },
    { roomNo: '3332', floorNo: 3, accountId: 'ACC_F3', rent: 2400 },

    // Floor 4 — 32 rooms, account ACC_F4
    { roomNo: '3401', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3402', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3403', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3404', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3405', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3406', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3407', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3408', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3409', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3410', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3411', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3412', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3413', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3414', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3415', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3416', floorNo: 4, accountId: 'ACC_F4', rent: 2200 },
    { roomNo: '3417', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3418', floorNo: 4, accountId: 'ACC_F4', rent: 3500 },
    { roomNo: '3419', floorNo: 4, accountId: 'ACC_F4', rent: 2400 },
    { roomNo: '3420', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3421', floorNo: 4, accountId: 'ACC_F4', rent: 2500 },
    { roomNo: '3422', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3423', floorNo: 4, accountId: 'ACC_F4', rent: 2400 },
    { roomNo: '3424', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3425', floorNo: 4, accountId: 'ACC_F4', rent: 2400 },
    { roomNo: '3426', floorNo: 4, accountId: 'ACC_F4', rent: 2400 },
    { roomNo: '3427', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3428', floorNo: 4, accountId: 'ACC_F4', rent: 2400 },
    { roomNo: '3429', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3430', floorNo: 4, accountId: 'ACC_F4', rent: 2900 },
    { roomNo: '3431', floorNo: 4, accountId: 'ACC_F4', rent: 2400 },
    { roomNo: '3432', floorNo: 4, accountId: 'ACC_F4', rent: 2400 },

    // Floor 5 — 32 rooms, account ACC_F5
    { roomNo: '3501', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3502', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3503', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3504', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3505', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3506', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3507', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3508', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3509', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3510', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3511', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3512', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3513', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3514', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3515', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3516', floorNo: 5, accountId: 'ACC_F5', rent: 2200 },
    { roomNo: '3517', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3518', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3519', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3520', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3521', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3522', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3523', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3524', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3525', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3526', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3527', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3528', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3529', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3530', floorNo: 5, accountId: 'ACC_F5', rent: 2900 },
    { roomNo: '3531', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },
    { roomNo: '3532', floorNo: 5, accountId: 'ACC_F5', rent: 2400 },

    // Floor 6 — 32 rooms, account ACC_F6
    { roomNo: '3601', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3602', floorNo: 6, accountId: 'ACC_F6', rent: 3500 },
    { roomNo: '3603', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3604', floorNo: 6, accountId: 'ACC_F6', rent: 3900 },
    { roomNo: '3605', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3606', floorNo: 6, accountId: 'ACC_F6', rent: 3900 },
    { roomNo: '3607', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3608', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3609', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3610', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3611', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3612', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3613', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3614', floorNo: 6, accountId: 'ACC_F6', rent: 3900 },
    { roomNo: '3615', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3616', floorNo: 6, accountId: 'ACC_F6', rent: 2200 },
    { roomNo: '3617', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3618', floorNo: 6, accountId: 'ACC_F6', rent: 3100 },
    { roomNo: '3619', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3620', floorNo: 6, accountId: 'ACC_F6', rent: 2400 },
    { roomNo: '3621', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3622', floorNo: 6, accountId: 'ACC_F6', rent: 2400 },
    { roomNo: '3623', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3624', floorNo: 6, accountId: 'ACC_F6', rent: 2400 },
    { roomNo: '3625', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3626', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3627', floorNo: 6, accountId: 'ACC_F6', rent: 2600 },
    { roomNo: '3628', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3629', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3630', floorNo: 6, accountId: 'ACC_F6', rent: 2900 },
    { roomNo: '3631', floorNo: 6, accountId: 'ACC_F6', rent: 2400 },
    { roomNo: '3632', floorNo: 6, accountId: 'ACC_F6', rent: 2400 },

    // Floor 7 — 32 rooms, account ACC_F7
    { roomNo: '3701', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3702', floorNo: 7, accountId: 'ACC_F7', rent: 3900 },
    { roomNo: '3703', floorNo: 7, accountId: 'ACC_F7', rent: 3900 },
    { roomNo: '3704', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3705', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3706', floorNo: 7, accountId: 'ACC_F7', rent: 3600 },
    { roomNo: '3707', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3708', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3709', floorNo: 7, accountId: 'ACC_F7', rent: 3200 },
    { roomNo: '3710', floorNo: 7, accountId: 'ACC_F7', rent: 3900 },
    { roomNo: '3711', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3712', floorNo: 7, accountId: 'ACC_F7', rent: 3900 },
    { roomNo: '3713', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3714', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3715', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3716', floorNo: 7, accountId: 'ACC_F7', rent: 2200 },
    { roomNo: '3717', floorNo: 7, accountId: 'ACC_F7', rent: 3500 },
    { roomNo: '3718', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3719', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3720', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3721', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3722', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3723', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3724', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3725', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3726', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3727', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3728', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3729', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3730', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3731', floorNo: 7, accountId: 'ACC_F7', rent: 2900 },
    { roomNo: '3732', floorNo: 7, accountId: 'ACC_F7', rent: 2400 },

    // Floor 8 — 32 rooms, account ACC_F8
    { roomNo: '3801', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3802', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3803', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3804', floorNo: 8, accountId: 'ACC_F8', rent: 3900 },
    { roomNo: '3805', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3806', floorNo: 8, accountId: 'ACC_F8', rent: 3300 },
    { roomNo: '3807', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3808', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3809', floorNo: 8, accountId: 'ACC_F8', rent: 3900 },
    { roomNo: '3810', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3811', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3812', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3813', floorNo: 8, accountId: 'ACC_F8', rent: 3700 },
    { roomNo: '3814', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3815', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3816', floorNo: 8, accountId: 'ACC_F8', rent: 2200 },
    { roomNo: '3817', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3818', floorNo: 8, accountId: 'ACC_F8', rent: 2600 },
    { roomNo: '3819', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3820', floorNo: 8, accountId: 'ACC_F8', rent: 2600 },
    { roomNo: '3821', floorNo: 8, accountId: 'ACC_F8', rent: 2600 },
    { roomNo: '3822', floorNo: 8, accountId: 'ACC_F8', rent: 2600 },
    { roomNo: '3823', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3824', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3825', floorNo: 8, accountId: 'ACC_F8', rent: 2600 },
    { roomNo: '3826', floorNo: 8, accountId: 'ACC_F8', rent: 2600 },
    { roomNo: '3827', floorNo: 8, accountId: 'ACC_F8', rent: 2600 },
    { roomNo: '3828', floorNo: 8, accountId: 'ACC_F8', rent: 2600 },
    { roomNo: '3829', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3830', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3831', floorNo: 8, accountId: 'ACC_F8', rent: 2900 },
    { roomNo: '3832', floorNo: 8, accountId: 'ACC_F8', rent: 3000 },
  ];

  let roomCount = 0;
  for (const r of rooms) {
    await prisma.room.upsert({
      where: { roomNo: r.roomNo },
      update: {
        floorNo: r.floorNo,
        defaultAccountId: r.accountId,
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: r.rent,
        hasFurniture: r.hasFurniture ?? false,
        defaultFurnitureAmount: r.furnitureAmount ?? 0,
        roomStatus: 'ACTIVE',
      },
      create: {
        roomNo: r.roomNo,
        floorNo: r.floorNo,
        defaultAccountId: r.accountId,
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: r.rent,
        hasFurniture: r.hasFurniture ?? false,
        defaultFurnitureAmount: r.furnitureAmount ?? 0,
        roomStatus: 'ACTIVE',
      },
    });
    roomCount++;
  }
  console.log(`Created ${roomCount} rooms`);

  // ──────────────────────────────────────────────────────────────────────────
  // Message templates
  // ──────────────────────────────────────────────────────────────────────────
  const messageTemplates = [
    {
      name: 'ส่งใบแจ้งหนี้',
      type: 'INVOICE_SEND' as const,
      body: 'เรียนคุณ {{tenantName}}\nใบแจ้งหนี้ประจำเดือน {{month}}/{{year}} ห้อง {{roomNo}}\nยอดรวม: {{totalAmount}} บาท\nกำหนดชำระ: {{dueDate}}\nดูใบแจ้งหนี้: {{invoiceUrl}}',
      variables: ['tenantName', 'month', 'year', 'roomNo', 'totalAmount', 'dueDate', 'invoiceUrl'],
    },
    {
      name: 'แจ้งเตือนค่าเช่า',
      type: 'PAYMENT_REMINDER' as const,
      body: 'เรียนคุณ {{tenantName}}\nขอเตือนการชำระค่าเช่าห้อง {{roomNo}} ยอดค้างชำระ {{totalAmount}} บาท\nกำหนดชำระ: {{dueDate}}',
      variables: ['tenantName', 'roomNo', 'totalAmount', 'dueDate'],
    },
    {
      name: 'แจ้งเตือนค้างชำระ',
      type: 'OVERDUE_NOTICE' as const,
      body: 'เรียนคุณ {{tenantName}}\nยังไม่ได้รับการชำระค่าเช่าห้อง {{roomNo}} ยอด {{totalAmount}} บาท\nกรุณาติดต่อ admin โดยด่วน',
      variables: ['tenantName', 'roomNo', 'totalAmount'],
    },
  ];

  for (const tmpl of messageTemplates) {
    const existing = await prisma.messageTemplate.findFirst({ where: { name: tmpl.name } });
    if (!existing) {
      await prisma.messageTemplate.create({ data: tmpl });
    }
  }
  console.log('Created message templates');

  // ──────────────────────────────────────────────────────────────────────────
  // Config
  // ──────────────────────────────────────────────────────────────────────────
  const configs = [
    { key: 'app.name', value: 'ระบบจัดการอพาร์ตเมนต์', description: 'Application name' },
    { key: 'app.currency', value: 'THB', description: 'Default currency' },
    { key: 'billing.dueDay', value: 25, description: 'Default payment due day of month' },
    { key: 'billing.reminderDaysBefore', value: 5, description: 'Days before due date to send reminder' },
  ];

  for (const cfg of configs) {
    await prisma.config.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value as any, description: cfg.description },
      create: { key: cfg.key, value: cfg.value as any, description: cfg.description },
    });
  }
  console.log('Created config entries');

  console.log('Seeding complete.');
  console.log(`Summary: 2 admin users, 8 bank accounts, 4 billing rules, ${roomCount} rooms`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
