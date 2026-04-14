import {
  DocumentFieldCategory,
  DocumentFieldValueType,
  DocumentTemplateStatus,
  DocumentTemplateType,
  DocumentTemplateVersionStatus,
  PrismaClient,
} from '@prisma/client';
import { createHash, randomBytes, scryptSync } from 'crypto';

const prisma = new PrismaClient();
const KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${derivedKey}`;
}

function hashTemplateBody(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

type SeedTemplateField = {
  key: string;
  label: string;
  category: DocumentFieldCategory;
  valueType: DocumentFieldValueType;
  path: string;
  description?: string;
  sampleValue?: string;
  isRequired?: boolean;
  isCollection?: boolean;
  metadata?: unknown;
  sortOrder: number;
};

function getSeedTemplateFields(type: DocumentTemplateType): SeedTemplateField[] {
  if (type === DocumentTemplateType.GENERAL_NOTICE) {
    return [
      {
        key: 'room.number',
        label: 'Room Number',
        category: DocumentFieldCategory.ROOM,
        valueType: DocumentFieldValueType.STRING,
        path: 'room.number',
        description: 'Display room number.',
        sampleValue: '101',
        isRequired: true,
        sortOrder: 20,
      },
      {
        key: 'computed.occupancyDisplay',
        label: 'Occupancy Display',
        category: DocumentFieldCategory.COMPUTED,
        valueType: DocumentFieldValueType.STRING,
        path: 'computed.occupancyDisplay',
        description: 'Display string for current room occupants.',
        sampleValue: 'Somchai Jaidee (Primary)',
        sortOrder: 610,
      },
    ];
  }

  const commonBillingFields: SeedTemplateField[] = [
    {
      key: 'room.number',
      label: 'Room Number',
      category: DocumentFieldCategory.ROOM,
      valueType: DocumentFieldValueType.STRING,
      path: 'room.number',
      description: 'Display room number.',
      sampleValue: '101',
      isRequired: true,
      sortOrder: 20,
    },
    {
      key: 'tenant.fullName',
      label: 'Tenant Full Name',
      category: DocumentFieldCategory.TENANT,
      valueType: DocumentFieldValueType.STRING,
      path: 'tenant.fullName',
      description: 'Primary resident full name.',
      sampleValue: 'Somchai Jaidee',
      sortOrder: 110,
    },
    {
      key: 'computed.billingMonthLabel',
      label: 'Billing Month Label',
      category: DocumentFieldCategory.COMPUTED,
      valueType: DocumentFieldValueType.STRING,
      path: 'computed.billingMonthLabel',
      description: 'Formatted billing month label.',
      sampleValue: 'April 2026',
      sortOrder: 590,
    },
    {
      key: 'computed.dueDateLabel',
      label: 'Due Date Label',
      category: DocumentFieldCategory.COMPUTED,
      valueType: DocumentFieldValueType.STRING,
      path: 'computed.dueDateLabel',
      description: 'Formatted billing due date.',
      sampleValue: '25 April 2026',
      sortOrder: 600,
    },
    {
      key: 'computed.totalAmountFormatted',
      label: 'Formatted Total Amount',
      category: DocumentFieldCategory.COMPUTED,
      valueType: DocumentFieldValueType.STRING,
      path: 'computed.totalAmountFormatted',
      description: 'Currency formatted total amount.',
      sampleValue: 'THB 3,696.00',
      sortOrder: 620,
    },
  ];

  if (type === DocumentTemplateType.PAYMENT_NOTICE) {
    return commonBillingFields;
  }

  if (type === DocumentTemplateType.INVOICE) {
    return [
      ...commonBillingFields,
      {
        key: 'billing_items',
        label: 'Billing Items',
        category: DocumentFieldCategory.BILLING_ITEM,
        valueType: DocumentFieldValueType.ARRAY,
        path: 'billingItems',
        description: 'Billing line items collection.',
        sampleValue: '[...]',
        isCollection: true,
        sortOrder: 500,
      },
      {
        key: 'billing_items.typeName',
        label: 'Billing Item Name',
        category: DocumentFieldCategory.BILLING_ITEM,
        valueType: DocumentFieldValueType.STRING,
        path: 'billingItems.typeName',
        description: 'Billing line item label.',
        sampleValue: 'Room Rent',
        isCollection: true,
        sortOrder: 510,
      },
      {
        key: 'billing_items.quantity',
        label: 'Billing Item Quantity',
        category: DocumentFieldCategory.BILLING_ITEM,
        valueType: DocumentFieldValueType.NUMBER,
        path: 'billingItems.quantity',
        description: 'Billing line item quantity.',
        sampleValue: '1',
        isCollection: true,
        sortOrder: 520,
      },
      {
        key: 'billing_items.unitPriceFormatted',
        label: 'Billing Item Unit Price',
        category: DocumentFieldCategory.BILLING_ITEM,
        valueType: DocumentFieldValueType.STRING,
        path: 'billingItems.unitPriceFormatted',
        description: 'Formatted unit price for each billing line item.',
        sampleValue: 'THB 3,000.00',
        isCollection: true,
        sortOrder: 530,
      },
      {
        key: 'billing_items.amountFormatted',
        label: 'Billing Item Amount',
        category: DocumentFieldCategory.BILLING_ITEM,
        valueType: DocumentFieldValueType.STRING,
        path: 'billingItems.amountFormatted',
        description: 'Formatted total amount for each billing line item.',
        sampleValue: 'THB 3,000.00',
        isCollection: true,
        sortOrder: 540,
      },
    ];
  }

  return [];
}

async function main() {
  const isProduction = process.env.NODE_ENV === 'production';
  const ownerPassword = process.env.SEED_OWNER_PASSWORD || (isProduction ? '' : 'Owner@12345');
  const staffPassword = process.env.SEED_STAFF_PASSWORD || (isProduction ? '' : 'Staff@12345');

  if (!ownerPassword || !staffPassword) {
    throw new Error(
      'SEED_OWNER_PASSWORD and SEED_STAFF_PASSWORD must be set when seeding in production.',
    );
  }

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
  // Config
  // ──────────────────────────────────────────────────────────────────────────
  const invoiceTemplateBody = [
    '<section style="font-family: Noto Sans Thai, sans-serif; color: #0f172a;">',
    '  <h1 style="font-size: 28px; margin-bottom: 8px;">\u0e43\u0e1a\u0e41\u0e08\u0e49\u0e07\u0e2b\u0e19\u0e35\u0e49</h1>',
    '  <p>\u0e2b\u0e49\u0e2d\u0e07 <strong><span data-template-field="room.number">{{room.number}}</span></strong></p>',
    '  <p>\u0e1c\u0e39\u0e49\u0e40\u0e0a\u0e48\u0e32 <span data-template-field="tenant.fullName">{{tenant.fullName}}</span></p>',
    '  <p>\u0e23\u0e2d\u0e1a\u0e1a\u0e34\u0e25 <span data-template-field="computed.billingMonthLabel">{{computed.billingMonthLabel}}</span></p>',
    '  <p>\u0e04\u0e23\u0e1a\u0e01\u0e33\u0e2b\u0e19\u0e14\u0e0a\u0e33\u0e23\u0e30 <span data-template-field="computed.dueDateLabel">{{computed.dueDateLabel}}</span></p>',
    '  <p>\u0e22\u0e2d\u0e14\u0e23\u0e27\u0e21 <strong><span data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</span></strong></p>',
    '  <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">',
    '    <thead>',
    '      <tr>',
    '        <th style="text-align: left; border-bottom: 1px solid #cbd5e1; padding: 8px;">\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23</th>',
    '        <th style="text-align: right; border-bottom: 1px solid #cbd5e1; padding: 8px;">\u0e08\u0e33\u0e19\u0e27\u0e19</th>',
    '        <th style="text-align: right; border-bottom: 1px solid #cbd5e1; padding: 8px;">\u0e23\u0e32\u0e04\u0e32\u0e15\u0e48\u0e2d\u0e2b\u0e19\u0e48\u0e27\u0e22</th>',
    '        <th style="text-align: right; border-bottom: 1px solid #cbd5e1; padding: 8px;">\u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19</th>',
    '      </tr>',
    '    </thead>',
    '    <tbody data-template-repeat="billing_items">',
    '      <tr>',
    '        <td style="padding: 8px;"><span data-template-field="billing_items.typeName">{{billing_items.typeName}}</span></td>',
    '        <td style="padding: 8px; text-align: right;"><span data-template-field="billing_items.quantity">{{billing_items.quantity}}</span></td>',
    '        <td style="padding: 8px; text-align: right;"><span data-template-field="billing_items.unitPriceFormatted">{{billing_items.unitPriceFormatted}}</span></td>',
    '        <td style="padding: 8px; text-align: right;"><span data-template-field="billing_items.amountFormatted">{{billing_items.amountFormatted}}</span></td>',
    '      </tr>',
    '    </tbody>',
    '  </table>',
    '</section>',
  ].join('\n');

  const paymentNoticeBody = [
    '<section style="font-family: Noto Sans Thai, sans-serif; color: #0f172a;">',
    '  <h1 style="font-size: 28px; margin-bottom: 8px;">\u0e41\u0e08\u0e49\u0e07\u0e40\u0e15\u0e37\u0e2d\u0e19\u0e0a\u0e33\u0e23\u0e30</h1>',
    '  <p>\u0e40\u0e23\u0e35\u0e22\u0e19 <span data-template-field="tenant.fullName">{{tenant.fullName}}</span></p>',
    '  <p>\u0e01\u0e23\u0e38\u0e13\u0e32\u0e14\u0e33\u0e40\u0e19\u0e34\u0e19\u0e01\u0e32\u0e23\u0e0a\u0e33\u0e23\u0e30\u0e04\u0e48\u0e32\u0e1e\u0e31\u0e01\u0e2b\u0e49\u0e2d\u0e07 <strong><span data-template-field="room.number">{{room.number}}</span></strong></p>',
    '  <p>\u0e1b\u0e23\u0e30\u0e08\u0e33\u0e23\u0e2d\u0e1a <span data-template-field="computed.billingMonthLabel">{{computed.billingMonthLabel}}</span></p>',
    '  <p>\u0e22\u0e2d\u0e14\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e0a\u0e33\u0e23\u0e30 <strong><span data-template-field="computed.totalAmountFormatted">{{computed.totalAmountFormatted}}</span></strong></p>',
    '  <p>\u0e01\u0e23\u0e38\u0e13\u0e32\u0e0a\u0e33\u0e23\u0e30\u0e20\u0e32\u0e22\u0e43\u0e19\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 <span data-template-field="computed.dueDateLabel">{{computed.dueDateLabel}}</span></p>',
    '  <p style="margin-top: 16px;">\u0e2b\u0e32\u0e01\u0e0a\u0e33\u0e23\u0e30\u0e41\u0e25\u0e49\u0e27 \u0e01\u0e23\u0e38\u0e13\u0e32\u0e2a\u0e48\u0e07\u0e2a\u0e25\u0e34\u0e1b\u0e43\u0e2b\u0e49\u0e40\u0e08\u0e49\u0e32\u0e2b\u0e19\u0e49\u0e32\u0e17\u0e35\u0e48\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a\u0e44\u0e14\u0e49\u0e17\u0e31\u0e19\u0e17\u0e35</p>',
    '</section>',
  ].join('\n');

  const generalNoticeBody = [
    '<section style="font-family: Noto Sans Thai, sans-serif; color: #0f172a;">',
    '  <h1 style="font-size: 28px; margin-bottom: 8px;">\u0e1b\u0e23\u0e30\u0e01\u0e32\u0e28\u0e16\u0e36\u0e07\u0e1c\u0e39\u0e49\u0e1e\u0e31\u0e01\u0e2d\u0e32\u0e28\u0e31\u0e22</h1>',
    '  <p>\u0e2b\u0e49\u0e2d\u0e07 <strong><span data-template-field="room.number">{{room.number}}</span></strong></p>',
    '  <p>\u0e23\u0e32\u0e22\u0e0a\u0e37\u0e48\u0e2d\u0e1c\u0e39\u0e49\u0e1e\u0e31\u0e01 <span data-template-field="computed.occupancyDisplay">{{computed.occupancyDisplay}}</span></p>',
    '  <p style="margin-top: 16px;">\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d: \u0e42\u0e1b\u0e23\u0e14\u0e01\u0e23\u0e2d\u0e01\u0e40\u0e19\u0e37\u0e49\u0e2d\u0e2b\u0e32\u0e1b\u0e23\u0e30\u0e01\u0e32\u0e28\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b\u0e17\u0e35\u0e48\u0e15\u0e49\u0e2d\u0e07\u0e01\u0e32\u0e23</p>',
    '  <p>\u0e15\u0e31\u0e27\u0e2d\u0e22\u0e48\u0e32\u0e07: \u0e01\u0e23\u0e38\u0e13\u0e32\u0e41\u0e08\u0e49\u0e07\u0e0b\u0e48\u0e2d\u0e21\u0e1a\u0e33\u0e23\u0e38\u0e07 \u0e2b\u0e23\u0e37\u0e2d\u0e01\u0e33\u0e2b\u0e19\u0e14\u0e01\u0e32\u0e23\u0e43\u0e0a\u0e49\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e2a\u0e48\u0e27\u0e19\u0e01\u0e25\u0e32\u0e07</p>',
    '</section>',
  ].join('\n');

  const documentTemplates = [
    {
      name: '\u0e43\u0e1a\u0e41\u0e08\u0e49\u0e07\u0e2b\u0e19\u0e35\u0e49\u0e21\u0e32\u0e15\u0e23\u0e10\u0e32\u0e19',
      description: '\u0e40\u0e17\u0e21\u0e40\u0e1e\u0e25\u0e15\u0e44\u0e27\u0e49\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e2d\u0e2d\u0e01\u0e43\u0e1a\u0e41\u0e08\u0e49\u0e07\u0e2b\u0e19\u0e35\u0e49\u0e23\u0e32\u0e22\u0e40\u0e14\u0e37\u0e2d\u0e19',
      type: DocumentTemplateType.INVOICE,
      subject: '\u0e43\u0e1a\u0e41\u0e08\u0e49\u0e07\u0e2b\u0e19\u0e35\u0e49 {{computed.billingMonthLabel}} \u0e2b\u0e49\u0e2d\u0e07 {{room.number}}',
      body: invoiceTemplateBody,
    },
    {
      name: '\u0e41\u0e08\u0e49\u0e07\u0e40\u0e15\u0e37\u0e2d\u0e19\u0e0a\u0e33\u0e23\u0e30\u0e21\u0e32\u0e15\u0e23\u0e10\u0e32\u0e19',
      description: '\u0e40\u0e17\u0e21\u0e40\u0e1e\u0e25\u0e15\u0e44\u0e27\u0e49\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e2a\u0e48\u0e07\u0e41\u0e08\u0e49\u0e07\u0e40\u0e15\u0e37\u0e2d\u0e19\u0e01\u0e48\u0e2d\u0e19\u0e04\u0e23\u0e1a\u0e01\u0e33\u0e2b\u0e19\u0e14',
      type: DocumentTemplateType.PAYMENT_NOTICE,
      subject: '\u0e41\u0e08\u0e49\u0e07\u0e40\u0e15\u0e37\u0e2d\u0e19 {{computed.billingMonthLabel}} \u0e2b\u0e49\u0e2d\u0e07 {{room.number}}',
      body: paymentNoticeBody,
    },
    {
      name: '\u0e1b\u0e23\u0e30\u0e01\u0e32\u0e28\u0e16\u0e36\u0e07\u0e1c\u0e39\u0e49\u0e1e\u0e31\u0e01\u0e41\u0e1a\u0e1a\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b',
      description: '\u0e40\u0e17\u0e21\u0e40\u0e1e\u0e25\u0e15\u0e15\u0e31\u0e49\u0e07\u0e15\u0e49\u0e19\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e1b\u0e23\u0e30\u0e01\u0e32\u0e28\u0e17\u0e31\u0e48\u0e27\u0e44\u0e1b\u0e16\u0e36\u0e07\u0e1c\u0e39\u0e49\u0e40\u0e0a\u0e48\u0e32',
      type: DocumentTemplateType.GENERAL_NOTICE,
      subject: '\u0e1b\u0e23\u0e30\u0e01\u0e32\u0e28\u0e2b\u0e49\u0e2d\u0e07 {{room.number}}',
      body: generalNoticeBody,
    },
  ];

  let documentTemplateCount = 0;
  for (const template of documentTemplates) {
    const existing = await prisma.documentTemplate.findFirst({ where: { name: template.name } });
    if (existing) {
      continue;
    }

    const createdTemplate = await prisma.documentTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        type: template.type,
        status: DocumentTemplateStatus.ACTIVE,
        subject: template.subject,
        body: template.body,
      },
    });

    const activeVersion = await prisma.documentTemplateVersion.create({
      data: {
        templateId: createdTemplate.id,
        version: 1,
        label: 'Initial version',
        subject: template.subject,
        body: template.body,
        status: DocumentTemplateVersionStatus.ACTIVE,
        fileType: 'html',
        checksum: hashTemplateBody(template.body),
        activatedAt: new Date(),
      },
    });

    await prisma.documentTemplate.update({
      where: { id: createdTemplate.id },
      data: {
        activeVersionId: activeVersion.id,
      },
    });

    await prisma.documentTemplateFieldDefinition.createMany({
      data: getSeedTemplateFields(template.type).map((field) => ({
        templateId: createdTemplate.id,
        key: field.key,
        label: field.label,
        category: field.category,
        valueType: field.valueType,
        path: field.path,
        description: field.description,
        sampleValue: field.sampleValue,
        isRequired: field.isRequired,
        isCollection: field.isCollection,
        sortOrder: field.sortOrder,
        metadata: field.metadata as any,
      })),
      skipDuplicates: true,
    });

    documentTemplateCount++;
  }
  console.log(`Created ${documentTemplateCount} document templates`);

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
