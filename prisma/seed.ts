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
        roomStatus: 'VACANT',
      },
      create: {
        roomNo: r.roomNo,
        floorNo: r.floorNo,
        defaultAccountId: r.accountId,
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: r.rent,
        hasFurniture: r.hasFurniture ?? false,
        defaultFurnitureAmount: r.furnitureAmount ?? 0,
        roomStatus: 'VACANT',
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
  // Document Templates (default built-in)
  // ──────────────────────────────────────────────────────────────────────────
  {
    const { DocumentTemplateType, DocumentTemplateStatus, DocumentTemplateVersionStatus } = await import('@prisma/client');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHash } = require('node:crypto');

    const TEMPLATES = [
      {
        type: DocumentTemplateType.INVOICE,
        name: 'ใบแจ้งหนี้รายเดือน',
        description: 'ใบแจ้งหนี้ค่าเช่าประจำเดือน — มีรายการค่าเช่า น้ำ ไฟ ค่าปรับ และยอดรวม',
        subject: 'ใบแจ้งหนี้ค่าเช่าห้อง {{room.number}} {{billing.monthName}} {{billing.year}}',
        body: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'DejaVu Sans', 'Noto Sans Thai', Arial, sans-serif; font-size: 14px; color: #2D2D2D; background: #FAF8F5; } .doc-header { background: linear-gradient(135deg, #5C8A68 0%, #4A7258 100%); color: white; padding: 28px 36px; } .doc-header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; } .doc-header .subtitle { font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; } .doc-body { padding: 28px 36px; background: #FFFFFF; } .doc-footer { padding: 16px 36px; background: #E8F0EB; border-top: 1px solid #E5E0DA; font-size: 11px; color: #6B6560; text-align: center; } .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; } .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 3px; } .info-value { font-size: 14px; font-weight: 600; color: #2D2D2D; } table { width: 100%; border-collapse: collapse; } th { background: #E8F0EB; color: #4A7258; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; font-weight: 600; } th.right { text-align: right; } td { padding: 10px 14px; border-bottom: 1px solid #E5E0DA; font-size: 13px; vertical-align: top; } td.right { text-align: right; font-variant-numeric: tabular-nums; } .total-row td { font-weight: 700; font-size: 15px; color: #4A7258; background: #E8F0EB; } .amount-due { background: #2D2D2D; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; margin-top: 16px; border-radius: 8px; } .amount-due .label { font-size: 12px; opacity: 0.85; } .amount-due .value { font-size: 20px; font-weight: 700; color: #D4AA62; } .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #E8F0EB; } .period-badge { display: inline-block; background: #D4AA62; color: white; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 4px; } .room-label { font-size: 22px; font-weight: 700; color: #4A7258; margin-bottom: 2px; } .thank-you { text-align: center; padding: 20px; color: #6B6560; font-size: 13px; }</style></head><body><div class="doc-header"><div class="logo">{{building.name}}</div><div class="subtitle">ใบแจ้งหนี้รายเดือน · {{building.address}}</div></div><div class="doc-body"><div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;"><div><div class="room-label">ห้อง {{room.number}}</div><span class="period-badge">{{billing.monthName}} {{billing.year}}</span></div><div style="text-align:right;"><div class="info-label">วันที่ออกใบแจ้งหนี้</div><div class="info-value">{{billing.issueDate}}</div><div class="info-label" style="margin-top:8px;">กำหนดชำระ</div><div class="info-value" style="color:#D4AA62;">{{billing.dueDate}}</div></div></div><div class="info-grid"><div><div class="info-label">ผู้เช่า</div><div class="info-value">{{tenant.fullName}}</div><div style="font-size:12px; color:#6B6560; margin-top:2px;">{{tenant.phone}}</div></div><div><div class="info-label">อาคาร / ชั้น</div><div class="info-value">{{building.name}} · ชั้น {{room.floorNumber}}</div></div></div><div class="section-title">รายการค่าใช้จ่าย</div><table><thead><tr><th>รายการ</th><th class="right">จำนวน</th></tr></thead><tbody><tr><td>ค่าเช่าห้องพัก · {{billing.monthName}} {{billing.year}}</td><td class="right">{{billing.rentAmount}}</td></tr>{{#if billing.waterTotal}}<tr><td>ค่าน้ำ ( {{billing.waterUnits}} หน่วย)</td><td class="right">{{billing.waterTotal}}</td></tr>{{/if}}{{#if billing.electricityTotal}}<tr><td>ค่าไฟฟ้า ( {{billing.electricityUnits}} หน่วย)</td><td class="right">{{billing.electricityTotal}}</td></tr>{{/if}}{{#if billing.lateFeeAmount}}<tr><td>ค่าปรับชำระเกินกำหนด</td><td class="right">{{billing.lateFeeAmount}}</td></tr>{{/if}}{{#each billing.extraCharges}}<tr><td>{{this.description}}</td><td class="right">{{this.amount}}</td></tr>{{/each}}</tbody></table><div class="amount-due"><div><div class="label">ยอดรวมที่ต้องชำระ</div></div><div class="value">{{billing.total}}</div></div>{{#if billing.notes}}<div style="margin-top:16px; padding:12px; background:#FAF8F5; border-radius:6px; font-size:12px; color:#6B6560;"><strong>หมายเหตุ:</strong> {{billing.notes}}</div>{{/if}}<div class="thank-you">ขอบคุณที่ใช้บริการ · กรุณาชำระเงินก่อนวันที่ {{billing.dueDate}}<br>หากมีข้อสงสัยติดต่อ {{building.phone}} หรือ {{building.email}}</div></div><div class="doc-footer">เอกสารนี้สร้างโดยระบบ Apartment ERP · ไม่ต้องพิมพ์ลายเซ็นต์</div></body></html>`,
      },
      {
        type: DocumentTemplateType.RECEIPT,
        name: 'ใบเสร็จรับเงิน',
        description: 'ใบเสร็จรับเงินค่าเช่า — ยืนยันการชำระเงินเรียบร้อย',
        subject: 'ใบเสร็จรับเงิน ห้อง {{room.number}}',
        body: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'DejaVu Sans', 'Noto Sans Thai', Arial, sans-serif; font-size: 14px; color: #2D2D2D; background: #FAF8F5; } .doc-header { background: linear-gradient(135deg, #5C8A68 0%, #4A7258 100%); color: white; padding: 28px 36px; } .doc-header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; } .doc-header .subtitle { font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; } .doc-body { padding: 28px 36px; background: #FFFFFF; } .doc-footer { padding: 16px 36px; background: #E8F0EB; border-top: 1px solid #E5E0DA; font-size: 11px; color: #6B6560; text-align: center; } .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 3px; } .info-value { font-size: 14px; font-weight: 600; color: #2D2D2D; } table { width: 100%; border-collapse: collapse; } th { background: #E8F0EB; color: #4A7258; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; font-weight: 600; } th.right { text-align: right; } td { padding: 10px 14px; border-bottom: 1px solid #E5E0DA; font-size: 13px; } td.right { text-align: right; font-variant-numeric: tabular-nums; } .total-row td { font-weight: 700; font-size: 15px; color: #4A7258; background: #E8F0EB; } .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #E8F0EB; } .receipt-box { max-width: 480px; margin: 0 auto; } .receipt-title { font-size: 22px; font-weight: 700; text-align: center; color: #4A7258; margin-bottom: 4px; } .receipt-sub { font-size: 12px; text-align: center; color: #6B6560; margin-bottom: 24px; } .receipt-number { font-size: 11px; color: #6B6560; text-align: center; margin-bottom: 20px; font-family: monospace; } .paid-stamp { text-align: center; margin: 20px 0; } .paid-stamp span { display: inline-block; border: 3px solid #5C8A68; color: #5C8A68; padding: 6px 24px; border-radius: 6px; font-size: 16px; font-weight: 800; letter-spacing: 0.1em; transform: rotate(-5deg); } .payment-info { background: #E8F0EB; border-radius: 8px; padding: 16px; margin-top: 20px; } .payment-info .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E0DA; font-size: 13px; } .payment-info .row:last-child { border-bottom: none; } .payment-info .label { color: #6B6560; } .payment-info .value { font-weight: 600; }</style></head><body><div class="doc-header"><div class="logo">{{building.name}}</div><div class="subtitle">ใบเสร็จรับเงิน · {{building.address}}</div></div><div class="doc-body"><div class="receipt-box"><div class="receipt-title">ใบเสร็จรับเงิน</div><div class="receipt-sub">RECEIPT</div><div class="receipt-number">เลขที่ {{receipt.number}} · วันที่ {{receipt.date}}</div><div class="paid-stamp"><span>ชำระแล้ว</span></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;"><div><div class="info-label">ผู้ชำระเงิน</div><div class="info-value">{{tenant.fullName}}</div></div><div><div class="info-label">ห้องพัก</div><div class="info-value">ห้อง {{room.number}} · ชั้น {{room.floorNumber}}</div></div></div><div class="section-title">รายละเอียดการชำระ</div><table><thead><tr><th>รายการ</th><th class="right">จำนวน (บาท)</th></tr></thead><tbody>{{#each receipt.items}}<tr><td>{{this.description}}</td><td class="right">{{this.amount}}</td></tr>{{/each}}<tr class="total-row"><td>รวมทั้งสิ้น</td><td class="right">{{receipt.total}}</td></tr></tbody></table><div class="payment-info"><div class="row"><span class="label">ช่องทางการชำระ</span><span class="value">{{receipt.method}}</span></div><div class="row"><span class="label">วันที่ชำระ</span><span class="value">{{receipt.paidDate}}</span></div>{{#if receipt.reference}}<div class="row"><span class="label">อ้างอิง</span><span class="value">{{receipt.reference}}</span></div>{{/if}}</div></div></div><div class="doc-footer">เอกสารนี้สร้างโดยระบบ Apartment ERP · ไม่ต้องพิมพ์ลายเซ็นต์</div></body></html>`,
      },
      {
        type: DocumentTemplateType.PAYMENT_NOTICE,
        name: 'แจ้งชำระค่าบริการ',
        description: 'ใบแจ้งชำระค่าบริการ — ส่งก่อนวันครบกำหนดหรือเมื่อเกินกำหนด',
        subject: 'แจ้งชำระค่าบริการ ห้อง {{room.number}} {{billing.monthName}} {{billing.year}}',
        body: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'DejaVu Sans', 'Noto Sans Thai', Arial, sans-serif; font-size: 14px; color: #2D2D2D; background: #FAF8F5; } .doc-header { background: linear-gradient(135deg, #5C8A68 0%, #4A7258 100%); color: white; padding: 28px 36px; } .doc-header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; } .doc-header .subtitle { font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; } .doc-body { padding: 28px 36px; background: #FFFFFF; } .doc-footer { padding: 16px 36px; background: #E8F0EB; border-top: 1px solid #E5E0DA; font-size: 11px; color: #6B6560; text-align: center; } .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; } .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 3px; } .info-value { font-size: 14px; font-weight: 600; color: #2D2D2D; } table { width: 100%; border-collapse: collapse; } th { background: #E8F0EB; color: #4A7258; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 14px; text-align: left; font-weight: 600; } th.right { text-align: right; } td { padding: 10px 14px; border-bottom: 1px solid #E5E0DA; font-size: 13px; } td.right { text-align: right; font-variant-numeric: tabular-nums; } .total-row td { font-weight: 700; font-size: 15px; color: #4A7258; background: #E8F0EB; } .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #E8F0EB; } .notice-title { font-size: 20px; font-weight: 700; text-align: center; color: #2D2D2D; margin-bottom: 6px; } .notice-sub { font-size: 12px; text-align: center; color: #6B6560; margin-bottom: 24px; } .urgent-box { background: #FEF3CD; border: 1px solid #E6C84C; border-radius: 8px; padding: 16px; margin: 20px 0; text-align: center; } .urgent-box .text { font-size: 14px; font-weight: 700; color: #856404; } .due-box { background: #2D2D2D; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; } .due-box .overdue { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #FF6B6B; margin-bottom: 6px; } .due-box .amount { font-size: 28px; font-weight: 700; color: #D4AA62; } .due-box .due-date { font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 6px; } .how-to-pay { background: #E8F0EB; border-radius: 8px; padding: 16px; margin-top: 20px; } .how-to-pay .title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 10px; } .how-to-pay .method { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E0DA; font-size: 13px; } .how-to-pay .method:last-child { border-bottom: none; }</style></head><body><div class="doc-header"><div class="logo">{{building.name}}</div><div class="subtitle">แจ้งเตือนค่าบริการ · {{building.address}}</div></div><div class="doc-body"><div class="notice-title">แจ้งชำระค่าบริการ</div><div class="notice-sub">PAYMENT NOTICE · {{billing.monthName}} {{billing.year}}</div><div class="info-grid"><div><div class="info-label">ผู้เช่า</div><div class="info-value">{{tenant.fullName}}</div></div><div><div class="info-label">ห้องพัก</div><div class="info-value">ห้อง {{room.number}} · ชั้น {{room.floorNumber}}</div></div></div>{{#if billing.isOverdue}}<div class="urgent-box"><div class="text">⚠️ ครบกำหนดชำระแล้ว · กรุณาชำระโดยเร็ว</div></div>{{/if}}<div class="due-box"><div class="overdue">{{#if billing.isOverdue}}เกินกำหนด{{else}}กรุณาชำระภายใน{{/if}}</div><div class="amount">{{billing.total}}</div><div class="due-date">วันที่ {{billing.dueDate}}</div></div><table><thead><tr><th>รายการ</th><th class="right">จำนวน (บาท)</th></tr></thead><tbody><tr><td>ค่าเช่าห้องพัก</td><td class="right">{{billing.rentAmount}}</td></tr>{{#if billing.waterTotal}}<tr><td>ค่าน้ำ</td><td class="right">{{billing.waterTotal}}</td></tr>{{/if}}{{#if billing.electricityTotal}}<tr><td>ค่าไฟฟ้า</td><td class="right">{{billing.electricityTotal}}</td></tr>{{/if}}{{#if billing.lateFeeAmount}}<tr><td>ค่าปรับ</td><td class="right">{{billing.lateFeeAmount}}</td></tr>{{/if}}<tr class="total-row"><td>รวมทั้งสิ้น</td><td class="right">{{billing.total}}</td></tr></tbody></table><div class="how-to-pay"><div class="title">ช่องทางการชำระเงิน</div>{{#each paymentMethods}}<div class="method"><span>{{this.name}}</span><span>{{this.account}}</span></div>{{/each}}</div><p style="margin-top:20px; font-size:12px; color:#6B6560; text-align:center;">หากชำระแล้วกรุณาแจ้งทาง LINE หรือติดต่อเจ้าหน้าที่ · {{building.phone}}<br>ขอบคุณที่ให้ความร่วมมือ</p></div><div class="doc-footer">เอกสารนี้สร้างโดยระบบ Apartment ERP · ไม่ต้องพิมพ์ลายเซ็นต์</div></body></html>`,
      },
      {
        type: DocumentTemplateType.CONTRACT,
        name: 'สัญญาเช่าที่พัก',
        description: 'สัญญาเช่าที่พักอาศัย — สรุปเงื่อนไขการเช่า ค่าเช่า ระยะเวลา และเงื่อนไขพิเศษ',
        subject: 'สัญญาเช่าที่พักอาศัย ห้อง {{room.number}}',
        body: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'DejaVu Sans', 'Noto Sans Thai', Arial, sans-serif; font-size: 14px; color: #2D2D2D; background: #FAF8F5; } .doc-header { background: linear-gradient(135deg, #5C8A68 0%, #4A7258 100%); color: white; padding: 28px 36px; } .doc-header .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; } .doc-header .subtitle { font-size: 11px; opacity: 0.85; margin-top: 4px; letter-spacing: 0.04em; } .doc-body { padding: 28px 36px; background: #FFFFFF; } .doc-footer { padding: 16px 36px; background: #E8F0EB; border-top: 1px solid #E5E0DA; font-size: 11px; color: #6B6560; text-align: center; } .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 3px; } .info-value { font-size: 14px; font-weight: 600; color: #2D2D2D; } .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #5C8A68; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #E8F0EB; } .contract-title { font-size: 18px; font-weight: 700; text-align: center; color: #4A7258; margin-bottom: 4px; letter-spacing: 0.04em; } .contract-sub { font-size: 12px; text-align: center; color: #6B6560; margin-bottom: 24px; } .contract-no { text-align: center; font-size: 12px; color: #6B6560; margin-bottom: 20px; font-family: monospace; background: #FAF8F5; padding: 8px; border-radius: 6px; } .parties { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: start; margin-bottom: 24px; } .party-box { background: #E8F0EB; border-radius: 8px; padding: 16px; } .party-box.right { background: #FAF8F5; } .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B6560; margin-bottom: 8px; } .party-name { font-size: 15px; font-weight: 700; color: #2D2D2D; margin-bottom: 4px; } .vs { font-size: 20px; font-weight: 700; color: #5C8A68; align-self: center; padding-top: 40px; } .terms-table { width: 100%; } .terms-table td { padding: 10px 14px; border: 1px solid #E5E0DA; font-size: 13px; vertical-align: top; } .terms-table td:first-child { font-weight: 600; color: #4A7258; background: #E8F0EB; width: 35%; } .sign-area { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; } .sign-box { border-top: 1px solid #2D2D2D; padding-top: 8px; text-align: center; font-size: 12px; color: #6B6560; } .sign-box .name { font-weight: 600; font-size: 13px; color: #2D2D2D; }</style></head><body><div class="doc-header"><div class="logo">{{building.name}}</div><div class="subtitle">สัญญาเช่าที่พัก · {{building.address}}</div></div><div class="doc-body"><div class="contract-title">สัญญาเช่าที่พักอาศัย</div><div class="contract-sub">RESIDENTIAL LEASE AGREEMENT</div><div class="contract-no">เลขที่สัญญา: {{contract.number}} · วันที่ลงนาม: {{contract.signDate}}</div><div class="parties"><div class="party-box"><div class="party-label">ผู้ให้เช่า ( Landlord )</div><div class="party-name">{{contract.landlordName}}</div><div style="font-size:12px; color:#6B6560;">{{contract.landlordAddress}}</div><div style="font-size:12px; color:#6B6560; margin-top:4px;">โทร: {{contract.landlordPhone}}</div></div><div class="vs">VS</div><div class="party-box right"><div class="party-label">ผู้เช่า ( Tenant )</div><div class="party-name">{{tenant.fullName}}</div><div style="font-size:12px; color:#6B6560;">{{tenant.address}}</div><div style="font-size:12px; color:#6B6560; margin-top:4px;">โทร: {{tenant.phone}}</div></div></div><div class="section-title">รายละเอียดการเช่า</div><table class="terms-table"><tr><td>ที่พักอาศัย</td><td>ห้องเลขที่ {{room.number}} ชั้น {{room.floorNumber}} อาคาร {{building.name}}</td></tr><tr><td>ระยะเวลาเช่า</td><td>ตั้งแต่ {{contract.startDate}} ถึง {{contract.endDate}}</td></tr><tr><td>ค่าเช่ารายเดือน</td><td>{{contract.monthlyRent}} บาท ( {{contract.monthlyRentText}} )</td></tr><tr><td>เงินประกัน</td><td>{{contract.deposit}} บาท ( {{contract.depositText}} )</td></tr><tr><td>วันชำระค่าเช่า</td><td>ภายในวันที่ {{contract.rentDueDay}} ของทุกเดือน</td></tr>{{#if contract.parkingSpaces}}<tr><td>ที่จอดรถ</td><td>{{contract.parkingSpaces}}</td></tr>{{/if}}</table>{{#if contract.specialTerms}}<div class="section-title" style="margin-top:20px;">เงื่อนไขพิเศษ</div><p style="font-size:13px; line-height:1.7;">{{contract.specialTerms}}</p>{{/if}}<div class="sign-area"><div class="sign-box"><div class="name">{{contract.landlordName}}</div><div class="role">ผู้ให้เช่า</div><div style="margin-top:8px;">วันที่: _____________</div></div><div class="sign-box"><div class="name">{{tenant.fullName}}</div><div class="role">ผู้เช่า</div><div style="margin-top:8px;">วันที่: _____________</div></div></div></div><div class="doc-footer">เอกสารนี้สร้างโดยระบบ Apartment ERP · ไม่ต้องพิมพ์ลายเซ็นต์</div></body></html>`,
      },
    ];

    for (const tpl of TEMPLATES) {
      const existing = await prisma.documentTemplate.findFirst({ where: { name: tpl.name } });
      if (existing) {
        console.log(`  Template "${tpl.name}" already exists, skipping.`);
        continue;
      }
      const template = await prisma.documentTemplate.create({
        data: { name: tpl.name, description: tpl.description, type: tpl.type, subject: tpl.subject, body: tpl.body, status: DocumentTemplateStatus.ACTIVE },
      });
      const version = await prisma.documentTemplateVersion.create({
        data: { templateId: template.id, version: 1, label: 'Default version', subject: tpl.subject, body: tpl.body, status: DocumentTemplateVersionStatus.ACTIVE, fileType: 'html', fileName: `${tpl.name.replace(/\s+/g, '_')}_v1.html`, activatedAt: new Date() },
      });
      await prisma.documentTemplate.update({ where: { id: template.id }, data: { activeVersionId: version.id } });
      console.log(`  Created template: "${tpl.name}"`);
    }
    console.log('Created default document templates');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Config
  // ──────────────────────────────────────────────────────────────────────────
  const configs = [
    { key: 'app.name', value: 'ระบบจัดการอพาร์ตเมนต์', description: 'Application name' },
    { key: 'app.currency', value: 'THB', description: 'Default currency' },
    { key: 'billing.dueDay', value: 25, description: 'Default payment due day of month' },
    { key: 'billing.reminderDaysBefore', value: 5, description: 'Days before due date to send reminder' },
    { key: 'system.initialized', value: true, description: 'System initialization flag' },
  ];

  for (const cfg of configs) {
    await prisma.config.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value as any, description: cfg.description },
      create: { key: cfg.key, value: cfg.value as any, description: cfg.description },
    });
  }
  // ──────────────────────────────────────────────────────────────────────────
  // Repair: ensure system.initialized is set to true
  // This repairs DBs that were seeded before this flag was added
  // ──────────────────────────────────────────────────────────────────────────
  await prisma.config.upsert({
    where: { key: 'system.initialized' },
    update: { value: true },
    create: { key: 'system.initialized', value: true, description: 'System initialization flag' },
  });
  console.log('Ensured system.initialized = true');

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
