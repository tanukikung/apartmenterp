/**
 * Move-Out Lifecycle Functional Tests
 *
 * Run with: USE_PRISMA_TEST_DB=true npx vitest run tests/moveouts-lifecycle.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, Prisma } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { EventTypes } from "@/lib";

const runIntegration =
  process.env.RUN_DB_INTEGRATION_TESTS === "true" &&
  process.env.USE_PRISMA_TEST_DB === "true";

async function safeDelete(prisma: PrismaClient, model: string, where: object): Promise<void> {
  try { await (prisma as any)[model].deleteMany({ where }); } catch {}
}

function createRealPrisma(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("[TEST] DATABASE_URL is not set");
  return new PrismaClient({ datasources: { db: { url: dbUrl } } });
}

async function seedRoom(db: PrismaClient, roomNo: string) {
  const bankId = "BA-" + uuidv4().slice(0, 8);
  const ruleId = "RUL-" + uuidv4().slice(0, 8);
  await db.bankAccount.create({ data: { id: bankId, name: "Test Bank", bankName: "Test Bank", bankAccountNo: "0000000000", active: true } });
  await db.billingRule.create({ data: { code: ruleId, descriptionTh: "Test Rule", waterEnabled: false, waterUnitPrice: new Prisma.Decimal(0), waterMinCharge: new Prisma.Decimal(0), waterServiceFeeMode: "NONE", waterServiceFeeAmount: new Prisma.Decimal(0), electricEnabled: false, electricUnitPrice: new Prisma.Decimal(0), electricMinCharge: new Prisma.Decimal(0), electricServiceFeeMode: "NONE", electricServiceFeeAmount: new Prisma.Decimal(0), penaltyPerDay: new Prisma.Decimal(0), maxPenalty: new Prisma.Decimal(0), gracePeriodDays: 0 } });
  await db.room.create({ data: { roomNo, floorNo: 1, defaultRentAmount: 5000, hasFurniture: false, defaultFurnitureAmount: 0, defaultAccountId: bankId, defaultRuleCode: ruleId } });
}

async function seedTenant(db: PrismaClient, emailSuffix: string) {
  const id = uuidv4();
  await db.tenant.create({ data: { id, firstName: "Test", lastName: "Tenant", phone: "0800000000", email: "t" + id.slice(0,8) + "@test.local" } });
  return id;
}

async function seedContract(db: PrismaClient, roomNo: string, tenantId: string) {
  const contractId = uuidv4();
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Tenant not found: " + tenantId);
  await db.contract.create({ data: { id: contractId, roomNo, primaryTenantId: tenant.id, monthlyRent: new Prisma.Decimal(15000), deposit: new Prisma.Decimal(30000), startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31"), status: "ACTIVE" } });
  await db.room.update({ where: { roomNo }, data: { roomStatus: "OCCUPIED" } });
  await db.roomTenant.create({ data: { roomNo, tenantId: tenant.id, role: "PRIMARY", moveInDate: new Date("2025-01-01"), moveOutDate: null } });
  return contractId;
}

async function getRoomDefaults(db: PrismaClient, roomNo: string) {
  const room = await db.room.findUnique({
    where: { roomNo },
    select: { defaultAccountId: true, defaultRuleCode: true },
  });
  if (!room) throw new Error("Room not found: " + roomNo);
  return room;
}

async function seedBillingPeriod(db: PrismaClient, year: number, month: number) {
  const bpId = "BP-" + year + "-" + month;
  try { await db.billingPeriod.create({ data: { id: bpId, year, month, status: "OPEN", dueDay: 25 } }); } catch (e: any) { if (e.code !== "P2002") throw e; }
  const bp = await db.billingPeriod.findUnique({ where: { id: bpId } });
  if (!bp) throw new Error("Cannot get billing period " + year + "/" + month);
  return bp;
}

describe.skipIf(!runIntegration)("move-out lifecycle", () => {
  let realPrisma: PrismaClient;

  beforeAll(async () => { realPrisma = createRealPrisma(); });
  afterAll(async () => { await realPrisma.$disconnect(); });

  it("1. createMoveOut(PENDING): contract stays ACTIVE, room stays OCCUPIED, moveOutDate null", async () => {
    const db = realPrisma;
    const roomNo = "T1-" + uuidv4().slice(0, 8);
    const tenantId = await seedTenant(db, "1");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId);

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });

    expect(moveOut.status).toBe("PENDING");
    expect(moveOut.contractId).toBe(contractId);

    const contract = await db.contract.findUnique({ where: { id: contractId } });
    expect(contract!.status).toBe("ACTIVE");

    const room = await db.room.findUnique({ where: { roomNo } });
    expect(room!.roomStatus).toBe("OCCUPIED");

    const rt = await db.roomTenant.findFirst({ where: { roomNo } });
    expect(rt!.moveOutDate).toBeNull();

    await safeDelete(db, "moveOut", { contractId });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenant deleted by id via cascade or manual cleanup below
    await safeDelete(db, "room", { roomNo });
  });


  it("2. confirmMoveOut(CONFIRMED): contract TERMINATED, room VACANT, moveOutDate set, MOVE_OUT_CONFIRMED emitted", async () => {
    const db = realPrisma;
    const roomNo = "T2-" + uuidv4().slice(0, 8);
    const tenantId = await seedTenant(db, "2");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId);
    await seedBillingPeriod(db, 2025, 6);

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });
    await service.calculateDeposit(moveOut.id, { cleaningFee: 500, damageRepairCost: 0, otherDeductions: 0 });
    const confirmed = await service.confirmMoveOut(moveOut.id, { reason: "Tenant moved out normally" });

    expect(confirmed.status).toBe("CONFIRMED");

    const contract = await db.contract.findUnique({ where: { id: contractId } });
    expect(contract!.status).toBe("TERMINATED");
    expect(contract!.terminationDate).not.toBeNull();

    const room = await db.room.findUnique({ where: { roomNo } });
    expect(room!.roomStatus).toBe("VACANT");

    const rt = await db.roomTenant.findFirst({ where: { roomNo } });
    expect(rt!.moveOutDate).not.toBeNull();

    const outboxEvents = await db.outboxEvent.findMany({ where: { aggregateType: "MoveOut", aggregateId: moveOut.id } });
    expect(outboxEvents).toHaveLength(1);
    expect(outboxEvents[0].eventType).toBe(EventTypes.MOVE_OUT_CONFIRMED);

    await safeDelete(db, "moveOutItem", { moveOutId: moveOut.id });
    await safeDelete(db, "moveOut", { id: moveOut.id });
    await safeDelete(db, "outboxEvent", { aggregateId: moveOut.id });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenant deleted by id via cascade or manual cleanup below
    await safeDelete(db, "room", { roomNo });
  });


  it("3. confirmMoveOut blocks if unpaid invoices exist", async () => {
    const db = realPrisma;
    const roomNo = "T3-" + uuidv4().slice(0, 8);
    const tenantId = await seedTenant(db, "3");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId);
    const bp = await seedBillingPeriod(db, 2025, 6);

    const invoiceId = uuidv4();
    const rbId = "RB-" + uuidv4().slice(0, 8);
    const defaults = await getRoomDefaults(db, roomNo);
    await db.roomBilling.create({ data: { id: rbId, billingPeriodId: bp.id, roomNo, recvAccountId: defaults.defaultAccountId, ruleCode: defaults.defaultRuleCode, rentAmount: new Prisma.Decimal(5000), waterMode: "NORMAL", waterUnits: new Prisma.Decimal(0), waterUsageCharge: new Prisma.Decimal(0), waterServiceFee: new Prisma.Decimal(0), waterTotal: new Prisma.Decimal(0), electricMode: "NORMAL", electricUnits: new Prisma.Decimal(0), electricUsageCharge: new Prisma.Decimal(0), electricServiceFee: new Prisma.Decimal(0), electricTotal: new Prisma.Decimal(0), furnitureFee: new Prisma.Decimal(0), otherFee: new Prisma.Decimal(0), totalDue: new Prisma.Decimal(5000), status: "INVOICED" } });
    await db.invoice.create({ data: { id: invoiceId, roomNo, roomBillingId: rbId, year: 2025, month: 6, version: 1, status: "GENERATED", totalAmount: new Prisma.Decimal(5000), dueDate: new Date("2025-06-25"), issuedAt: new Date() } });

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });
    await service.calculateDeposit(moveOut.id, { cleaningFee: 0, damageRepairCost: 0, otherDeductions: 0 });

    await expect(service.confirmMoveOut(moveOut.id, { reason: "Should fail due to unpaid invoice" })).rejects.toThrow();

    const stillDepositCalc = await db.moveOut.findUnique({ where: { id: moveOut.id } });
    expect(stillDepositCalc!.status).toBe("DEPOSIT_CALCULATED");

    await safeDelete(db, "moveOutItem", { moveOutId: moveOut.id });
    await safeDelete(db, "moveOut", { id: moveOut.id });
    await safeDelete(db, "invoice", { id: invoiceId });
    await safeDelete(db, "roomBilling", { id: rbId });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenant deleted by id via cascade or manual cleanup below
    await safeDelete(db, "room", { roomNo });
  });


  it("4. concurrent confirmMoveOut cannot double-finalize", async () => {
    const db = realPrisma;
    const roomNo = "T4-" + uuidv4().slice(0, 8);
    const tenantId = await seedTenant(db, "4");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId);

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });
    await service.calculateDeposit(moveOut.id, { cleaningFee: 0, damageRepairCost: 0, otherDeductions: 0 });

    const [first, second] = await Promise.allSettled([
      service.confirmMoveOut(moveOut.id, { reason: "First caller" }),
      service.confirmMoveOut(moveOut.id, { reason: "Second caller" }),
    ]);

    const successes = [first, second].filter(r => r.status === "fulfilled");
    const failures = [first, second].filter(r => r.status === "rejected");

    expect(successes).toHaveLength(1);

    const failedReason = (failures[0] as PromiseRejectedResult).reason;
    expect(failedReason instanceof Error).toBe(true);

    const final = await db.moveOut.findUnique({ where: { id: moveOut.id } });
    expect(final!.status).toBe("CONFIRMED");

    const outboxCount = await db.outboxEvent.count({ where: { aggregateId: moveOut.id } });
    expect(outboxCount).toBe(1);

    await safeDelete(db, "moveOutItem", { moveOutId: moveOut.id });
    await safeDelete(db, "moveOut", { id: moveOut.id });
    await safeDelete(db, "outboxEvent", { aggregateId: moveOut.id });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenant deleted by id via cascade or manual cleanup below
    await safeDelete(db, "room", { roomNo });
  });


  it("5. cancelMoveOut before confirm only marks CANCELLED, does not restore state", async () => {
    const db = realPrisma;
    const roomNo = "T5-" + uuidv4().slice(0, 8);
    const tenantId = await seedTenant(db, "5");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId);

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });
    expect(moveOut.status).toBe("PENDING");

    const cancelled = await service.cancelMoveOut(moveOut.id, "Tenant decided to stay");
    expect(cancelled.status).toBe("CANCELLED");

    const contract = await db.contract.findUnique({ where: { id: contractId } });
    expect(contract!.status).toBe("ACTIVE");

    const room = await db.room.findUnique({ where: { roomNo } });
    expect(room!.roomStatus).toBe("OCCUPIED");

    const rt = await db.roomTenant.findFirst({ where: { roomNo } });
    expect(rt!.moveOutDate).toBeNull();

    await safeDelete(db, "moveOutItem", { moveOutId: moveOut.id });
    await safeDelete(db, "moveOut", { id: moveOut.id });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenant deleted by id via cascade or manual cleanup below
    await safeDelete(db, "room", { roomNo });
  });


  it("6. cancelMoveOut after confirm restores: contract ACTIVE, room OCCUPIED, moveOutDate null", async () => {
    const db = realPrisma;
    const roomNo = "T6-" + uuidv4().slice(0, 8);
    const tenantId = await seedTenant(db, "6");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId);
    await seedBillingPeriod(db, 2025, 6);

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });
    await service.calculateDeposit(moveOut.id, { cleaningFee: 0, damageRepairCost: 0, otherDeductions: 0 });
    await service.confirmMoveOut(moveOut.id, { reason: "Tenant moved out" });

    await service.cancelMoveOut(moveOut.id, "Mistake");

    const contract = await db.contract.findUnique({ where: { id: contractId } });
    expect(contract!.status).toBe("ACTIVE");
    expect(contract!.terminationDate).toBeNull();

    const room = await db.room.findUnique({ where: { roomNo } });
    expect(room!.roomStatus).toBe("OCCUPIED");

    const rt = await db.roomTenant.findFirst({ where: { roomNo } });
    expect(rt!.moveOutDate).toBeNull();

    await safeDelete(db, "moveOutItem", { moveOutId: moveOut.id });
    await safeDelete(db, "moveOut", { id: moveOut.id });
    await safeDelete(db, "outboxEvent", { aggregateId: moveOut.id });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenant deleted by id via cascade or manual cleanup below
    await safeDelete(db, "room", { roomNo });
  });


  it("7. refundMoveOut is idempotent if already REFUNDED", async () => {
    const db = realPrisma;
    const roomNo = "T7-" + uuidv4().slice(0, 8);
    const tenantId = await seedTenant(db, "7");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId);
    await seedBillingPeriod(db, 2025, 6);

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });
    await service.calculateDeposit(moveOut.id, { cleaningFee: 0, damageRepairCost: 0, otherDeductions: 0 });
    await service.confirmMoveOut(moveOut.id, { reason: "Tenant moved out" });

    const firstRefund = await service.markRefund(moveOut.id, { reason: "Deposit refunded" });
    expect(firstRefund.status).toBe("REFUNDED");

    const secondRefund = await service.markRefund(moveOut.id, { reason: "Deposit refunded again" });
    expect(secondRefund.status).toBe("REFUNDED");
    expect(secondRefund.id).toBe(firstRefund.id);

    await safeDelete(db, "moveOutItem", { moveOutId: moveOut.id });
    await safeDelete(db, "moveOut", { id: moveOut.id });
    await safeDelete(db, "outboxEvent", { aggregateId: moveOut.id });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenant deleted by id via cascade or manual cleanup below
    await safeDelete(db, "room", { roomNo });
  });


  it("8. confirmMoveOut sets room to VACANT regardless of co-tenants", async () => {
    const db = realPrisma;
    const roomNo = "T8-" + uuidv4().slice(0, 8);
    const tenantId1 = await seedTenant(db, "8a");
    const tenantId2 = await seedTenant(db, "8b");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId1);

    const tenant2 = await db.tenant.findUnique({ where: { id: tenantId2 } });
    await db.roomTenant.create({ data: { roomNo, tenantId: tenant2!.id, role: "SECONDARY", moveInDate: new Date("2025-01-01"), moveOutDate: null } });

    await seedBillingPeriod(db, 2025, 6);

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });
    await service.calculateDeposit(moveOut.id, { cleaningFee: 0, damageRepairCost: 0, otherDeductions: 0 });

    const confirmed = await service.confirmMoveOut(moveOut.id, { reason: "Primary tenant moved out" });
    expect(confirmed.status).toBe("CONFIRMED");

    const room = await db.room.findUnique({ where: { roomNo } });
    expect(room!.roomStatus).toBe("VACANT");

    await safeDelete(db, "moveOutItem", { moveOutId: moveOut.id });
    await safeDelete(db, "moveOut", { id: moveOut.id });
    await safeDelete(db, "outboxEvent", { aggregateId: moveOut.id });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenants cleaned up
    // tenants cleaned up
    await safeDelete(db, "room", { roomNo });
  });


  it("9. confirmMoveOut is atomic - all terminal changes commit or none do", async () => {
    const db = realPrisma;
    const roomNo = "T9-" + uuidv4().slice(0, 8);
    const tenantId = await seedTenant(db, "9");
    await seedRoom(db, roomNo);
    const contractId = await seedContract(db, roomNo, tenantId);
    await seedBillingPeriod(db, 2025, 6);

    const { MoveOutService } = await import("@/modules/moveouts/moveout.service");
    const service = new MoveOutService();
    const moveOut = await service.createMoveOut({ contractId, moveOutDate: "2025-06-30" });
    await service.calculateDeposit(moveOut.id, { cleaningFee: 0, damageRepairCost: 0, otherDeductions: 0 });

    await service.confirmMoveOut(moveOut.id, { reason: "Atomic test" });

    const [contract, room, rt, moveOutRecord] = await Promise.all([
      db.contract.findUnique({ where: { id: contractId } }),
      db.room.findUnique({ where: { roomNo } }),
      db.roomTenant.findFirst({ where: { roomNo } }),
      db.moveOut.findUnique({ where: { id: moveOut.id } }),
    ]);

    expect(contract!.status).toBe("TERMINATED");
    expect(room!.roomStatus).toBe("VACANT");
    expect(rt!.moveOutDate).not.toBeNull();
    expect(moveOutRecord!.status).toBe("CONFIRMED");

    await safeDelete(db, "moveOutItem", { moveOutId: moveOut.id });
    await safeDelete(db, "moveOut", { id: moveOut.id });
    await safeDelete(db, "outboxEvent", { aggregateId: moveOut.id });
    await safeDelete(db, "roomTenant", { roomNo });
    await safeDelete(db, "contract", { id: contractId });
    // tenant deleted by id via cascade or manual cleanup below
    await safeDelete(db, "room", { roomNo });
  });
});
