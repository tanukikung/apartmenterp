/**
 * Payment Test Data Seed
 * Creates data for statement upload E2E tests.
 * Run: npx tsx tests/e2e/data/seed-payment-test-data.ts
 */
import { PrismaClient, RoomStatus, BillingPeriodStatus, ContractStatus, InvoiceStatus, MeterMode, Prisma } from '@prisma/client';
import { scryptSync, randomBytes } from 'crypto';

// Re-implement exactly as src/lib/auth/password.ts does
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  // KEY_LENGTH=64, N=131072, r=8, p=1, maxmem=268435456
  const derivedKey = scryptSync(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 268435456 }).toString('hex');
  return `scrypt:v2:N=131072:r=8:p=1:${salt}:${derivedKey}`;
}

function dec(n: number): Prisma.Decimal { return new Prisma.Decimal(n); }

const prisma = new PrismaClient();

// ── Clean up ─────────────────────────────────────────────────────────────────

export async function cleanupPaymentTestData() {
  await prisma.$executeRawUnsafe(`DELETE FROM "payment_transactions" WHERE "roomNo" LIKE 'PAYTEST-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "payment_matches" WHERE "invoiceId" LIKE 'PAYTEST-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "payments" WHERE "matchedInvoiceId" LIKE 'PAYTEST-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "invoices" WHERE "id" LIKE 'PAYTEST-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "room_billings" WHERE "roomNo" LIKE 'PAYTEST-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "room_tenants" WHERE "roomNo" LIKE 'PAYTEST-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "contracts" WHERE "roomNo" LIKE 'PAYTEST-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "tenants" WHERE "id" LIKE 'PAYTEST-TENANT-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "billing_periods" WHERE "id" LIKE 'PAYTEST-BP-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "rooms" WHERE "roomNo" LIKE 'PAYTEST-%'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "bank_accounts" WHERE id = 'PAYTEST-ACC-001'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "billing_rules" WHERE code = 'PAYTEST-RULE-001'`);
}

// ── Seed helpers ─────────────────────────────────────────────────────────────

async function ensureBankAccount() {
  return prisma.bankAccount.upsert({
    where: { id: 'PAYTEST-ACC-001' },
    update: {},
    create: {
      id: 'PAYTEST-ACC-001',
      name: 'Test K-Bank Account',
      bankName: 'ธนาคารกสิกรไทย',
      bankAccountNo: '123-4-56789-0',
      promptpay: null,
      active: true,
    },
  });
}

async function ensureBillingRule() {
  return prisma.billingRule.upsert({
    where: { code: 'PAYTEST-RULE-001' },
    update: {},
    create: {
      code: 'PAYTEST-RULE-001',
      descriptionTh: 'Payment Test Rule',
      waterEnabled: true,
      waterUnitPrice: dec(20),
      waterMinCharge: dec(100),
      waterServiceFeeMode: 'NONE',
      waterServiceFeeAmount: dec(0),
      electricEnabled: true,
      electricUnitPrice: dec(9),
      electricMinCharge: dec(45),
      electricServiceFeeMode: 'NONE',
      electricServiceFeeAmount: dec(0),
      penaltyPerDay: dec(50),
      maxPenalty: dec(1000),
      gracePeriodDays: 3,
      commonAreaWaterEnabled: false,
    },
  });
}

async function ensureAdminUser() {
  const ownerHash = hashPassword('Owner@12345');
  return prisma.adminUser.upsert({
    where: { username: 'owner' },
    update: {},
    create: {
      id: 'PAYTEST-OWNER-001',
      username: 'owner',
      displayName: 'Test Owner',
      role: 'OWNER',
      passwordHash: ownerHash,
      isActive: true,
      forcePasswordChange: false,
    },
  });
}

async function ensureRoom(roomNo: string, floorNo: number, rentAmount: number) {
  const bankAccount = await ensureBankAccount();
  const billingRule = await ensureBillingRule();
  return prisma.room.upsert({
    where: { roomNo },
    update: {},
    create: {
      roomNo,
      floorNo,
      defaultAccountId: bankAccount.id,
      defaultRuleCode: billingRule.code,
      defaultRentAmount: dec(rentAmount),
      hasFurniture: false,
      roomStatus: RoomStatus.OCCUPIED,
      maxResidents: 2,
    },
  });
}

async function ensureTenant(tenantNo: string, firstName: string, lastName: string) {
  return prisma.tenant.upsert({
    where: { id: `PAYTEST-TENANT-${tenantNo}` },
    update: {},
    create: {
      id: `PAYTEST-TENANT-${tenantNo}`,
      firstName,
      lastName,
      phone: '0812345678',
      email: `${firstName.toLowerCase()}@test.local`,
      emergencyContact: null,
      emergencyPhone: null,
    },
  });
}

async function ensureContract(roomNo: string, tenantId: string, startDate: Date, endDate: Date) {
  return prisma.contract.upsert({
    where: { id: `PAYTEST-CONTRACT-${roomNo}` },
    update: {},
    create: {
      id: `PAYTEST-CONTRACT-${roomNo}`,
      roomNo,
      primaryTenantId: tenantId,
      startDate,
      endDate,
      monthlyRent: dec(8000),
      deposit: dec(16000),
      furnitureFee: dec(0),
      status: ContractStatus.ACTIVE,
    },
  });
}

async function ensureBillingPeriod(year: number, month: number) {
  return prisma.billingPeriod.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: {
      id: `PAYTEST-BP-${year}-${month}`,
      year,
      month,
      status: BillingPeriodStatus.OPEN,
      dueDay: 5,
    },
  });
}

// ── Shared invoice creator ───────────────────────────────────────────────────

async function createTestInvoice(
  id: string,
  roomBillingId: string,
  roomNo: string,
  year: number,
  month: number,
  dueDate: Date,
  sentAt: Date | null,
): Promise<string> {
  const totalAmount = 9850;
  await prisma.invoice.upsert({
    where: { id },
    update: {},
    create: {
      id,
      roomBillingId,
      roomNo,
      year,
      month,
      status: InvoiceStatus.SENT,
      totalAmount: dec(totalAmount),
      snapshotTotal: dec(totalAmount),
      snapshotLateFee: dec(0),
      dueDate,
      sentAt,
      issuedAt: sentAt ?? new Date(),
    },
  });
  return id;
}

// ── Scenario 1: On-time exact payment ──────────────────────────────────────

export interface Scenario1Setup {
  roomNo: string;
  invoiceId: string;
  roomBillingId: string;
  invoiceTotal: number;
}

export async function setupScenario1_PaysOnTime(year: number, month: number) {
  const bankAccount = await ensureBankAccount();
  const room = await ensureRoom('PAYTEST-101', 1, 8000);
  const tenant = await ensureTenant('01', 'สมชาย', 'ไทย');
  await ensureContract('PAYTEST-101', tenant.id, new Date(`${year}-01-01`), new Date(`${year}-12-31`));
  const period = await ensureBillingPeriod(year, month);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 5);

  const roomBilling = await prisma.roomBilling.upsert({
    where: { id: 'PAYTEST-RB-101' },
    update: {},
    create: {
      id: 'PAYTEST-RB-101',
      billingPeriodId: period.id,
      roomNo: room.roomNo,
      recvAccountId: bankAccount.id,
      ruleCode: 'PAYTEST-RULE-001',
      rentAmount: dec(8000),
      waterMode: MeterMode.NORMAL,
      waterPrev: dec(10), waterCurr: dec(35),
      waterUnits: dec(25), waterUsageCharge: dec(500),
      waterServiceFee: dec(0), waterTotal: dec(500),
      electricMode: MeterMode.NORMAL,
      electricPrev: dec(200), electricCurr: dec(350),
      electricUnits: dec(150), electricUsageCharge: dec(1350),
      electricServiceFee: dec(0), electricTotal: dec(1350),
      furnitureFee: dec(0), otherFee: dec(0),
      totalDue: dec(9850),
      status: 'LOCKED',
    },
  });

  const invoiceId = await createTestInvoice(
    'PAYTEST-INV-101', roomBilling.id, room.roomNo,
    year, month, dueDate, new Date(),
  );

  return { roomNo: room.roomNo, invoiceId, roomBillingId: roomBilling.id, invoiceTotal: 9850 };
}

// ── Scenario 2: Late payment (overdue) ───────────────────────────────────────

export interface Scenario2Setup {
  roomNo: string;
  invoiceId: string;
  roomBillingId: string;
  invoiceTotal: number;
}

export async function setupScenario2_PaysLate(year: number, month: number) {
  const bankAccount = await ensureBankAccount();
  const room = await ensureRoom('PAYTEST-102', 1, 8000);
  const tenant = await ensureTenant('02', 'วิชัย', 'วัง');
  await ensureContract('PAYTEST-102', tenant.id, new Date(`${year}-01-01`), new Date(`${year}-12-31`));
  const period = await ensureBillingPeriod(year, month);

  // Due 10 days ago → already OVERDUE
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() - 10);

  const roomBilling = await prisma.roomBilling.upsert({
    where: { id: 'PAYTEST-RB-102' },
    update: {},
    create: {
      id: 'PAYTEST-RB-102',
      billingPeriodId: period.id,
      roomNo: room.roomNo,
      recvAccountId: bankAccount.id,
      ruleCode: 'PAYTEST-RULE-001',
      rentAmount: dec(8000),
      waterMode: MeterMode.NORMAL,
      waterPrev: dec(10), waterCurr: dec(35),
      waterUnits: dec(25), waterUsageCharge: dec(500),
      waterServiceFee: dec(0), waterTotal: dec(500),
      electricMode: MeterMode.NORMAL,
      electricPrev: dec(200), electricCurr: dec(350),
      electricUnits: dec(150), electricUsageCharge: dec(1350),
      electricServiceFee: dec(0), electricTotal: dec(1350),
      furnitureFee: dec(0), otherFee: dec(0),
      totalDue: dec(9850),
      status: 'LOCKED',
    },
  });

  const invoiceId = await createTestInvoice(
    'PAYTEST-INV-102', roomBilling.id, room.roomNo,
    year, month, dueDate, new Date(Date.now() - 15 * 86400000), // sent 15 days ago
  );

  return { roomNo: room.roomNo, invoiceId, roomBillingId: roomBilling.id, invoiceTotal: 9850 };
}

// ── Scenario 4: Partial payment ──────────────────────────────────────────────

export interface Scenario4Setup {
  roomNo: string;
  invoiceId: string;
  roomBillingId: string;
  invoiceTotal: number;
  partialAmount: number;
}

export async function setupScenario4_PartialPayment(year: number, month: number) {
  const bankAccount = await ensureBankAccount();
  const room = await ensureRoom('PAYTEST-104', 1, 8000);
  const tenant = await ensureTenant('04', 'มานี', 'นวล');
  await ensureContract('PAYTEST-104', tenant.id, new Date(`${year}-01-01`), new Date(`${year}-12-31`));
  const period = await ensureBillingPeriod(year, month);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const roomBilling = await prisma.roomBilling.upsert({
    where: { id: 'PAYTEST-RB-104' },
    update: {},
    create: {
      id: 'PAYTEST-RB-104',
      billingPeriodId: period.id,
      roomNo: room.roomNo,
      recvAccountId: bankAccount.id,
      ruleCode: 'PAYTEST-RULE-001',
      rentAmount: dec(8000),
      waterMode: MeterMode.NORMAL,
      waterPrev: dec(10), waterCurr: dec(35),
      waterUnits: dec(25), waterUsageCharge: dec(500),
      waterServiceFee: dec(0), waterTotal: dec(500),
      electricMode: MeterMode.NORMAL,
      electricPrev: dec(200), electricCurr: dec(350),
      electricUnits: dec(150), electricUsageCharge: dec(1350),
      electricServiceFee: dec(0), electricTotal: dec(1350),
      furnitureFee: dec(0), otherFee: dec(0),
      totalDue: dec(9850),
      status: 'LOCKED',
    },
  });

  const invoiceId = await createTestInvoice(
    'PAYTEST-INV-104', roomBilling.id, room.roomNo,
    year, month, dueDate, new Date(),
  );

  return { roomNo: room.roomNo, invoiceId, roomBillingId: roomBilling.id, invoiceTotal: 9850, partialAmount: 5000 };
}

// ── Scenario 5: Overpayment ─────────────────────────────────────────────────

export interface Scenario5Setup {
  roomNo: string;
  invoiceId: string;
  roomBillingId: string;
  invoiceTotal: number;
  paidAmount: number;
}

export async function setupScenario5_Overpayment(year: number, month: number) {
  const bankAccount = await ensureBankAccount();
  const room = await ensureRoom('PAYTEST-105', 1, 8000);
  const tenant = await ensureTenant('05', 'สุข', 'ผ่อง');
  await ensureContract('PAYTEST-105', tenant.id, new Date(`${year}-01-01`), new Date(`${year}-12-31`));
  const period = await ensureBillingPeriod(year, month);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 5);

  const roomBilling = await prisma.roomBilling.upsert({
    where: { id: 'PAYTEST-RB-105' },
    update: {},
    create: {
      id: 'PAYTEST-RB-105',
      billingPeriodId: period.id,
      roomNo: room.roomNo,
      recvAccountId: bankAccount.id,
      ruleCode: 'PAYTEST-RULE-001',
      rentAmount: dec(8000),
      waterMode: MeterMode.NORMAL,
      waterPrev: dec(10), waterCurr: dec(35),
      waterUnits: dec(25), waterUsageCharge: dec(500),
      waterServiceFee: dec(0), waterTotal: dec(500),
      electricMode: MeterMode.NORMAL,
      electricPrev: dec(200), electricCurr: dec(350),
      electricUnits: dec(150), electricUsageCharge: dec(1350),
      electricServiceFee: dec(0), electricTotal: dec(1350),
      furnitureFee: dec(0), otherFee: dec(0),
      totalDue: dec(9850),
      status: 'LOCKED',
    },
  });

  const invoiceId = await createTestInvoice(
    'PAYTEST-INV-105', roomBilling.id, room.roomNo,
    year, month, dueDate, new Date(),
  );

  return { roomNo: room.roomNo, invoiceId, roomBillingId: roomBilling.id, invoiceTotal: 9850, paidAmount: 12000 };
}

// ── Scenario 6: Underpayment ─────────────────────────────────────────────────

export interface Scenario6Setup {
  roomNo: string;
  invoiceId: string;
  roomBillingId: string;
  invoiceTotal: number;
  paidAmount: number;
}

export async function setupScenario6_Underpayment(year: number, month: number) {
  const bankAccount = await ensureBankAccount();
  const room = await ensureRoom('PAYTEST-106', 1, 8000);
  const tenant = await ensureTenant('06', 'อดิศักดิ์', 'ดี');
  await ensureContract('PAYTEST-106', tenant.id, new Date(`${year}-01-01`), new Date(`${year}-12-31`));
  const period = await ensureBillingPeriod(year, month);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 5);

  const roomBilling = await prisma.roomBilling.upsert({
    where: { id: 'PAYTEST-RB-106' },
    update: {},
    create: {
      id: 'PAYTEST-RB-106',
      billingPeriodId: period.id,
      roomNo: room.roomNo,
      recvAccountId: bankAccount.id,
      ruleCode: 'PAYTEST-RULE-001',
      rentAmount: dec(8000),
      waterMode: MeterMode.NORMAL,
      waterPrev: dec(10), waterCurr: dec(35),
      waterUnits: dec(25), waterUsageCharge: dec(500),
      waterServiceFee: dec(0), waterTotal: dec(500),
      electricMode: MeterMode.NORMAL,
      electricPrev: dec(200), electricCurr: dec(350),
      electricUnits: dec(150), electricUsageCharge: dec(1350),
      electricServiceFee: dec(0), electricTotal: dec(1350),
      furnitureFee: dec(0), otherFee: dec(0),
      totalDue: dec(9850),
      status: 'LOCKED',
    },
  });

  const invoiceId = await createTestInvoice(
    'PAYTEST-INV-106', roomBilling.id, room.roomNo,
    year, month, dueDate, new Date(),
  );

  return { roomNo: room.roomNo, invoiceId, roomBillingId: roomBilling.id, invoiceTotal: 9850, paidAmount: 8000 };
}

// ── Scenario 7: Wrong room (no matching invoice) ─────────────────────────────

export interface Scenario7Setup {
  roomNo: string;
}

export async function setupScenario7_WrongRoom(year: number, month: number) {
  const bankAccount = await ensureBankAccount();
  const room = await ensureRoom('PAYTEST-107', 1, 8000);
  const tenant = await ensureTenant('07', 'ประยุทธ', 'ใจดี');
  await ensureContract('PAYTEST-107', tenant.id, new Date(`${year}-01-01`), new Date(`${year}-12-31`));
  const period = await ensureBillingPeriod(year, month);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 5);

  const roomBilling = await prisma.roomBilling.upsert({
    where: { id: 'PAYTEST-RB-107' },
    update: {},
    create: {
      id: 'PAYTEST-RB-107',
      billingPeriodId: period.id,
      roomNo: room.roomNo,
      recvAccountId: bankAccount.id,
      ruleCode: 'PAYTEST-RULE-001',
      rentAmount: dec(8000),
      waterMode: MeterMode.NORMAL,
      waterPrev: dec(10), waterCurr: dec(35),
      waterUnits: dec(25), waterUsageCharge: dec(500),
      waterServiceFee: dec(0), waterTotal: dec(500),
      electricMode: MeterMode.NORMAL,
      electricPrev: dec(200), electricCurr: dec(350),
      electricUnits: dec(150), electricUsageCharge: dec(1350),
      electricServiceFee: dec(0), electricTotal: dec(1350),
      furnitureFee: dec(0), otherFee: dec(0),
      totalDue: dec(9850),
      status: 'LOCKED',
    },
  });

  await createTestInvoice(
    'PAYTEST-INV-107', roomBilling.id, room.roomNo,
    year, month, dueDate, new Date(),
  );

  return { roomNo: room.roomNo };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;

  console.log('Cleaning up...');
  await cleanupPaymentTestData();

  console.log('Seeding admin user...');
  await ensureAdminUser();

  console.log('Setting up scenarios...');
  const s1 = await setupScenario1_PaysOnTime(year, month);
  console.log(`S1: room=${s1.roomNo} invoice=${s1.invoiceId} total=${s1.invoiceTotal}`);

  const s2 = await setupScenario2_PaysLate(year, month);
  console.log(`S2: room=${s2.roomNo} invoice=${s2.invoiceId} total=${s2.invoiceTotal} (overdue)`);

  const s4 = await setupScenario4_PartialPayment(year, month);
  console.log(`S4: room=${s4.roomNo} partial=${s4.partialAmount}/${s4.invoiceTotal}`);

  const s5 = await setupScenario5_Overpayment(year, month);
  console.log(`S5: room=${s5.roomNo} paid=${s5.paidAmount}/${s5.invoiceTotal} (overpay)`);

  const s6 = await setupScenario6_Underpayment(year, month);
  console.log(`S6: room=${s6.roomNo} paid=${s6.paidAmount}/${s6.invoiceTotal} (underpay)`);

  const s7 = await setupScenario7_WrongRoom(year, month);
  console.log(`S7: room=${s7.roomNo} (wrong invoice ref → NEED_REVIEW)`);

  console.log('\nAll scenarios seeded successfully!');
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });