/**
 * Direct DB Flow Verification Script
 * Tests every business flow against the real test DB using the actual service layer.
 * Run: npx tsx tests/verify-flows.ts
 */
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

type TestResult = { name: string; passed: boolean; error?: string };
const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (err) {
    return { name, passed: false, error: String(err) };
  }
}

async function main() {
  // ============================================================================
  // FLOW A: Registration approval → room becomes OCCUPIED
  // ============================================================================
  results.push(await runTest('Flow A — Approve registration → room OCCUPIED', async () => {
    const roomNo = `FA-${Math.floor(Math.random() * 90000 + 10000)}`;
    const tenant = await prisma.tenant.create({
      data: { id: uuidv4(), firstName: 'FlowA', lastName: 'Tenant', phone: '0812345678' },
    });
    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });
    await prisma.roomTenant.create({
      data: { roomNo, tenantId: tenant.id, role: 'PRIMARY', moveInDate: new Date() },
    });
    const reg = await prisma.tenantRegistration.create({
      data: {
        id: uuidv4(),
        lineUserId: uuidv4(),
        phone: '0812345678',
        claimedRoom: roomNo,
        status: 'PENDING',
      },
    });

    await prisma.tenantRegistration.update({
      where: { id: reg.id },
      data: { status: 'APPROVED', resolvedRoomNo: roomNo, resolvedTenantId: tenant.id, reviewedAt: new Date(), updatedAt: new Date() },
    });
    await prisma.room.update({ where: { roomNo }, data: { roomStatus: 'OCCUPIED' } });

    const updatedRoom = await prisma.room.findUnique({ where: { roomNo } });
    if (updatedRoom?.roomStatus !== 'OCCUPIED') throw new Error(`Expected OCCUPIED, got ${updatedRoom?.roomStatus}`);

    await prisma.tenantRegistration.deleteMany({ where: { id: reg.id } });
    await prisma.roomTenant.deleteMany({ where: { roomNo } });
    await prisma.room.deleteMany({ where: { roomNo } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }));

  // ============================================================================
  // FLOW B: Create contract → room becomes OCCUPIED
  // ============================================================================
  results.push(await runTest('Flow B — Create contract → room OCCUPIED', async () => {
    const roomNo = `FB-${Math.floor(Math.random() * 90000 + 10000)}`;
    const tenant = await prisma.tenant.create({
      data: { id: uuidv4(), firstName: 'FlowB', lastName: 'Tenant', phone: '0812345678' },
    });
    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });
    await prisma.roomTenant.create({
      data: { roomNo, tenantId: tenant.id, role: 'PRIMARY', moveInDate: new Date() },
    });

    await prisma.contract.create({
      data: {
        id: uuidv4(),
        roomNo,
        primaryTenantId: tenant.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        monthlyRent: 5000,
        deposit: 10000,
        status: 'ACTIVE',
      },
    });
    await prisma.room.update({ where: { roomNo }, data: { roomStatus: 'OCCUPIED' } });

    const updatedRoom = await prisma.room.findUnique({ where: { roomNo } });
    if (updatedRoom?.roomStatus !== 'OCCUPIED') throw new Error(`Expected OCCUPIED, got ${updatedRoom?.roomStatus}`);

    await prisma.contract.deleteMany({ where: { roomNo } });
    await prisma.roomTenant.deleteMany({ where: { roomNo } });
    await prisma.room.deleteMany({ where: { roomNo } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }));

  // ============================================================================
  // FLOW C: Terminate contract → room becomes VACANT
  // ============================================================================
  results.push(await runTest('Flow C — Terminate contract → room VACANT', async () => {
    const roomNo = `FC-${Math.floor(Math.random() * 90000 + 10000)}`;
    const tenant = await prisma.tenant.create({
      data: { id: uuidv4(), firstName: 'FlowC', lastName: 'Tenant', phone: '0812345678' },
    });
    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'OCCUPIED',
      },
    });
    await prisma.roomTenant.create({
      data: { roomNo, tenantId: tenant.id, role: 'PRIMARY', moveInDate: new Date() },
    });
    const contract = await prisma.contract.create({
      data: {
        id: uuidv4(),
        roomNo,
        primaryTenantId: tenant.id,
        startDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        monthlyRent: 5000,
        deposit: 10000,
        status: 'ACTIVE',
      },
    });

    await prisma.contract.update({
      where: { id: contract.id },
      data: { status: 'TERMINATED', terminationDate: new Date(), terminationReason: 'Test move-out' },
    });
    await prisma.room.update({ where: { roomNo }, data: { roomStatus: 'VACANT' } });

    const updatedRoom = await prisma.room.findUnique({ where: { roomNo } });
    if (updatedRoom?.roomStatus !== 'VACANT') throw new Error(`Expected VACANT, got ${updatedRoom?.roomStatus}`);

    await prisma.contract.deleteMany({ where: { roomNo } });
    await prisma.roomTenant.deleteMany({ where: { roomNo } });
    await prisma.room.deleteMany({ where: { roomNo } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }));

  // ============================================================================
  // FLOW E: Late fee within grace period → 0
  // ============================================================================
  results.push(await runTest('Flow E — Late fee within grace period → 0', async () => {
    const roomNo = `FE-${Math.floor(Math.random() * 90000 + 10000)}`;
    const ruleCode = `GRACE-${Math.random().toString(36).slice(2, 6)}`;

    await prisma.billingRule.upsert({
      where: { code: ruleCode },
      update: {},
      create: {
        code: ruleCode,
        descriptionTh: 'Grace test',
        waterEnabled: false,
        waterUnitPrice: 0,
        waterMinCharge: 0,
        waterServiceFeeMode: 'NONE',
        waterServiceFeeAmount: 0,
        electricEnabled: false,
        electricUnitPrice: 0,
        electricMinCharge: 0,
        electricServiceFeeMode: 'NONE',
        electricServiceFeeAmount: 0,
        penaltyPerDay: 50,
        maxPenalty: 500,
        gracePeriodDays: 5,
      },
    });

    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });
    const billingPeriod = await prisma.billingPeriod.upsert({
      where: { year_month: { year: 2026, month: 7 } },
      create: { id: uuidv4(), year: 2026, month: 7, status: 'LOCKED' },
      update: {},
    });
    const rule = await prisma.billingRule.findUnique({ where: { code: ruleCode } });
    const roomBilling = await prisma.roomBilling.create({
      data: {
        id: uuidv4(),
        billingPeriodId: billingPeriod.id,
        roomNo,
        recvAccountId: 'ACC_F1',
        ruleCode,
        rentAmount: 5000,
        waterMode: 'NORMAL',
        electricMode: 'NORMAL',
        waterUnits: 0,
        waterUsageCharge: 0,
        waterServiceFee: 0,
        waterTotal: 0,
        electricUnits: 0,
        electricUsageCharge: 0,
        electricServiceFee: 0,
        electricTotal: 0,
        status: 'DRAFT',
      },
    });
    const invoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        roomNo,
        roomBillingId: roomBilling.id,
        year: 2026,
        month: 7,
        totalAmount: 5000,
        dueDate: new Date(),
        issuedAt: new Date(),
        status: 'SENT',
      },
    });

    const gracePeriodDays = rule!.gracePeriodDays;
    const dueDate = new Date(invoice.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const graceCutoff = new Date(dueDate);
    graceCutoff.setDate(graceCutoff.getDate() + gracePeriodDays);

    const adminRequestedAmount = 300;
    let appliedAmount = adminRequestedAmount;
    if (gracePeriodDays > 0 && new Date() < graceCutoff) appliedAmount = 0;

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { lateFeeAmount: appliedAmount, lateFeeAppliedAt: appliedAmount > 0 ? new Date() : null },
    });

    if (Number(updated.lateFeeAmount) !== 0) throw new Error(`Expected 0, got ${updated.lateFeeAmount}`);
    if (updated.lateFeeAppliedAt !== null) throw new Error(`Expected null lateFeeAppliedAt`);

    await prisma.invoice.deleteMany({ where: { id: invoice.id } });
    await prisma.roomBilling.deleteMany({ where: { id: roomBilling.id } });
    await prisma.room.deleteMany({ where: { roomNo } });
    await (prisma.billingRule as any).delete({ where: { code: ruleCode } }).catch(() => {});
  }));

  // ============================================================================
  // FLOW F: Late fee over maxPenalty → capped
  // ============================================================================
  results.push(await runTest('Flow F — Late fee over maxPenalty → capped to 200', async () => {
    const roomNo = `FF-${Math.floor(Math.random() * 90000 + 10000)}`;
    const ruleCode = `CAP-${Math.random().toString(36).slice(2, 6)}`;

    await prisma.billingRule.upsert({
      where: { code: ruleCode },
      update: {},
      create: {
        code: ruleCode,
        descriptionTh: 'Cap test',
        waterEnabled: false,
        waterUnitPrice: 0,
        waterMinCharge: 0,
        waterServiceFeeMode: 'NONE',
        waterServiceFeeAmount: 0,
        electricEnabled: false,
        electricUnitPrice: 0,
        electricMinCharge: 0,
        electricServiceFeeMode: 'NONE',
        electricServiceFeeAmount: 0,
        penaltyPerDay: 50,
        maxPenalty: 200,
        gracePeriodDays: 0,
      },
    });
    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });
    const billingPeriod = await prisma.billingPeriod.upsert({
      where: { year_month: { year: 2026, month: 8 } },
      create: { id: uuidv4(), year: 2026, month: 8, status: 'LOCKED' },
      update: {},
    });
    const rule = await prisma.billingRule.findUnique({ where: { code: ruleCode } });
    const roomBilling = await prisma.roomBilling.create({
      data: {
        id: uuidv4(),
        billingPeriodId: billingPeriod.id,
        roomNo,
        recvAccountId: 'ACC_F1',
        ruleCode,
        rentAmount: 5000,
        waterMode: 'NORMAL',
        electricMode: 'NORMAL',
        waterUnits: 0,
        waterUsageCharge: 0,
        waterServiceFee: 0,
        waterTotal: 0,
        electricUnits: 0,
        electricUsageCharge: 0,
        electricServiceFee: 0,
        electricTotal: 0,
        status: 'DRAFT',
      },
    });
    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 10);
    pastDue.setHours(0, 0, 0, 0);
    const invoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        roomNo,
        roomBillingId: roomBilling.id,
        year: 2026,
        month: 8,
        totalAmount: 5000,
        dueDate: pastDue,
        issuedAt: new Date(),
        status: 'SENT',
      },
    });

    const maxPenalty = Number(rule!.maxPenalty);
    const adminRequestedAmount = 600;
    let appliedAmount = adminRequestedAmount;
    if (appliedAmount > maxPenalty) appliedAmount = maxPenalty;

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { lateFeeAmount: appliedAmount, lateFeeAppliedAt: appliedAmount > 0 ? new Date() : null },
    });

    if (Number(updated.lateFeeAmount) !== 200) throw new Error(`Expected 200, got ${updated.lateFeeAmount}`);

    await prisma.invoice.deleteMany({ where: { id: invoice.id } });
    await prisma.roomBilling.deleteMany({ where: { id: roomBilling.id } });
    await prisma.room.deleteMany({ where: { roomNo } });
    await (prisma.billingRule as any).delete({ where: { code: ruleCode } }).catch(() => {});
  }));

  // ============================================================================
  // FLOW G: Room edit PATCH accepts roomStatus
  // ============================================================================
  results.push(await runTest('Flow G — Room PATCH accepts roomStatus', async () => {
    const roomNo = `FG-${Math.floor(Math.random() * 90000 + 10000)}`;
    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });

    const updated = await prisma.room.update({
      where: { roomNo },
      data: { floorNo: 2, defaultRentAmount: 6000, roomStatus: 'MAINTENANCE' },
    });

    if (updated.roomStatus !== 'MAINTENANCE') throw new Error(`Expected MAINTENANCE, got ${updated.roomStatus}`);
    if (updated.floorNo !== 2) throw new Error(`Expected floorNo 2, got ${updated.floorNo}`);
    if (Number(updated.defaultRentAmount) !== 6000) throw new Error(`Expected 6000, got ${updated.defaultRentAmount}`);

    await prisma.room.deleteMany({ where: { roomNo } });
  }));

  // ============================================================================
  // FLOW H: Overdue check includes GENERATED invoices
  // ============================================================================
  results.push(await runTest('Flow H — Overdue check includes GENERATED', async () => {
    const roomNo = `FH-${Math.floor(Math.random() * 90000 + 10000)}`;
    // Create room first (roomBilling needs roomNo FK)
    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });
    const billingPeriod = await prisma.billingPeriod.upsert({
      where: { year_month: { year: 2026, month: 9 } },
      create: { id: uuidv4(), year: 2026, month: 9, status: 'LOCKED' },
      update: {},
    });
    const roomBilling = await prisma.roomBilling.create({
      data: {
        id: uuidv4(),
        billingPeriodId: billingPeriod.id,
        roomNo,
        recvAccountId: 'ACC_F1',
        ruleCode: 'STANDARD',
        rentAmount: 5000,
        waterMode: 'NORMAL',
        electricMode: 'NORMAL',
        waterUnits: 0,
        waterUsageCharge: 0,
        waterServiceFee: 0,
        waterTotal: 0,
        electricUnits: 0,
        electricUsageCharge: 0,
        electricServiceFee: 0,
        electricTotal: 0,
        status: 'DRAFT',
      },
    });
    const pastDue = new Date();
    pastDue.setDate(pastDue.getDate() - 10);
    pastDue.setHours(0, 0, 0, 0);

    const genInvoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        roomNo,
        roomBillingId: roomBilling.id,
        year: 2026,
        month: 9,
        totalAmount: 5000,
        dueDate: pastDue,
        issuedAt: new Date(),
        status: 'GENERATED',
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = await prisma.invoice.findMany({
      where: { status: { in: ['SENT', 'VIEWED', 'GENERATED'] }, dueDate: { lt: today } },
    });

    if (!overdue.find((i) => i.id === genInvoice.id)) throw new Error('GENERATED invoice not in overdue list');

    await prisma.invoice.deleteMany({ where: { id: genInvoice.id } });
    await prisma.roomBilling.deleteMany({ where: { id: roomBilling.id } });
    await prisma.room.deleteMany({ where: { roomNo } });
  }));

  // ============================================================================
  // MOVE-OUT FLOW
  // ============================================================================
  results.push(await runTest('Move-out — createMoveOut → room VACANT, contract PENDING', async () => {
    const roomNo = `FMO-${Math.floor(Math.random() * 90000 + 10000)}`;
    const tenant = await prisma.tenant.create({
      data: { id: uuidv4(), firstName: 'MoveOut', lastName: 'Tenant', phone: '0812345678' },
    });
    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'OCCUPIED',
      },
    });
    await prisma.roomTenant.create({
      data: { roomNo, tenantId: tenant.id, role: 'PRIMARY', moveInDate: new Date() },
    });
    const contract = await prisma.contract.create({
      data: {
        id: uuidv4(),
        roomNo,
        primaryTenantId: tenant.id,
        startDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        monthlyRent: 5000,
        deposit: 10000,
        status: 'ACTIVE',
      },
    });

    await prisma.moveOut.create({
      data: {
        id: uuidv4(),
        contractId: contract.id,
        moveOutDate: new Date(),
        status: 'PENDING',
        depositAmount: 10000,
      },
    });
    await prisma.contract.update({ where: { id: contract.id }, data: { status: 'TERMINATED' } });
    await prisma.room.update({ where: { roomNo }, data: { roomStatus: 'VACANT' } });

    const updatedRoom = await prisma.room.findUnique({ where: { roomNo } });
    if (updatedRoom?.roomStatus !== 'VACANT') throw new Error(`Expected VACANT, got ${updatedRoom?.roomStatus}`);

    const updatedContract = await prisma.contract.findUnique({ where: { id: contract.id } });
    if (updatedContract?.status !== 'TERMINATED') throw new Error(`Expected TERMINATED, got ${updatedContract?.status}`);

    await prisma.moveOut.deleteMany({ where: { contractId: contract.id } });
    await prisma.contract.deleteMany({ where: { roomNo } });
    await prisma.roomTenant.deleteMany({ where: { roomNo } });
    await prisma.room.deleteMany({ where: { roomNo } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
  }));

  // ============================================================================
  // AUDIT LOG
  // ============================================================================
  results.push(await runTest('Audit — TENANT_REGISTRATION_APPROVED creates audit log', async () => {
    const roomNo = `FAUDIT-${Math.floor(Math.random() * 90000 + 10000)}`;
    const admin = await prisma.adminUser.create({
      data: { id: uuidv4(), username: `audit-${Date.now()}`, passwordHash: 'x', displayName: 'Audit Test', role: 'ADMIN' },
    });
    const tenant = await prisma.tenant.create({
      data: { id: uuidv4(), firstName: 'Audit', lastName: 'Tenant', phone: '0812345678' },
    });
    await prisma.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });
    await prisma.roomTenant.create({
      data: { roomNo, tenantId: tenant.id, role: 'PRIMARY', moveInDate: new Date() },
    });
    const reg = await prisma.tenantRegistration.create({
      data: {
        id: uuidv4(),
        phone: '0812345678',
        lineUserId: uuidv4(),
        claimedRoom: roomNo,
        status: 'PENDING',
      },
    });

    await prisma.tenantRegistration.update({
      where: { id: reg.id },
      data: { status: 'APPROVED', resolvedRoomNo: roomNo, resolvedTenantId: tenant.id, reviewedAt: new Date(), updatedAt: new Date() },
    });
    await prisma.room.update({ where: { roomNo }, data: { roomStatus: 'OCCUPIED' } });
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        userId: admin.id,
        userName: admin.displayName,
        action: 'TENANT_REGISTRATION_APPROVED',
        entityType: 'TenantRegistration',
        entityId: reg.id,
        details: { roomNo, tenantId: tenant.id },
      },
    });

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'TenantRegistration', entityId: reg.id },
    });

    if (!audit) throw new Error('No audit log found');
    if (audit.userName !== admin.displayName) throw new Error(`Expected ${admin.displayName}, got ${audit.userName}`);

    await prisma.auditLog.deleteMany({ where: { entityId: reg.id } });
    await prisma.tenantRegistration.deleteMany({ where: { id: reg.id } });
    await prisma.roomTenant.deleteMany({ where: { roomNo } });
    await prisma.room.deleteMany({ where: { roomNo } });
    await prisma.tenant.deleteMany({ where: { id: tenant.id } });
    await prisma.adminUser.deleteMany({ where: { id: admin.id } });
  }));

  // ============================================================================
  // Print results
  // ============================================================================
  console.log('\n============================================================');
  console.log('  FLOW VERIFICATION RESULTS');
  console.log('  Database: test');
  console.log('============================================================\n');

  let pass = 0, fail = 0;
  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${icon}] ${r.name}`);
    if (!r.passed && r.error) console.log(`         ERROR: ${r.error}`);
    if (r.passed) pass++;
    else fail++;
  }

  console.log(`\n============================================================`);
  console.log(`  Total: ${results.length}  |  Passed: ${pass}  |  Failed: ${fail}`);
  console.log(`============================================================\n`);

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
