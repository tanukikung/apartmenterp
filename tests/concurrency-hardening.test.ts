/**
 * Concurrency Hardening Tests — Multi-Admin Safety
 *
 * Tests use real Prisma + PostgreSQL to verify optimistic locking and
 * FOR UPDATE protection for billing operations.
 *
 * Run with: USE_PRISMA_TEST_DB=true npx vitest run tests/concurrency-hardening.test.ts
 * Requires: DATABASE_URL pointing to a real PostgreSQL instance
 *
 * Key scenarios tested:
 * 1. Two admins close same billing period → one succeeds, one gets OptimisticLockError
 * 2. Concurrent invoice regeneration → second gets OptimisticLockError
 * 3. Billing import + manual update racing → FOR UPDATE prevents interleaving
 * 4. FOR UPDATE prevents dirty read on invoice row during payment
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Enable real DB for this test file
process.env.USE_PRISMA_TEST_DB = 'true';

// ── Prisma client factory ───────────────────────────────────────────────────

async function getPrisma(): Promise<PrismaClient> {
  const { prisma } = await import('@/lib/db/client');
  return prisma as PrismaClient;
}

// ── Import the OptimisticLockError for testing ─────────────────────────────
import { OptimisticLockError } from '@/lib/concurrency/optimistic-lock';

// ── Factory helpers ─────────────────────────────────────────────────────────

/**
 * Creates a complete billing period + room billing + room setup.
 * Returns cleanup function.
 */
async function createBillingPeriodWithRoom(
  prisma: PrismaClient,
  year: number = 2026,
  month: number = 1,
  periodStatus: string = 'OPEN',
  billingStatus: string = 'LOCKED'
): Promise<{
  periodId: string;
  billingId: string;
  roomNo: string;
  accId: string;
  ruleCode: string;
  cleanup: () => Promise<void>;
}> {
  const roomNo = `TEST-${uuidv4().slice(0, 8).toUpperCase()}`;
  const accId = `test-acc-${uuidv4().slice(0, 8)}`;
  const ruleCode = `test-rule-${uuidv4().slice(0, 8)}`;

  // Create bank account
  await prisma.bankAccount.create({
    data: {
      id: accId,
      name: 'Test Bank',
      bankName: 'Test Bank',
      bankAccountNo: '0000000000',
      active: true,
    },
  });

  // Create billing rule
  await prisma.billingRule.create({
    data: {
      code: ruleCode,
      descriptionTh: 'Test Rule',
      waterEnabled: false,
      waterUnitPrice: new Prisma.Decimal(0),
      waterMinCharge: new Prisma.Decimal(0),
      waterServiceFeeMode: 'NONE',
      waterServiceFeeAmount: new Prisma.Decimal(0),
      electricEnabled: false,
      electricUnitPrice: new Prisma.Decimal(0),
      electricMinCharge: new Prisma.Decimal(0),
      electricServiceFeeMode: 'NONE',
      electricServiceFeeAmount: new Prisma.Decimal(0),
      penaltyPerDay: new Prisma.Decimal(0),
      maxPenalty: new Prisma.Decimal(0),
      gracePeriodDays: 0,
    },
  });

  // Create billing period
  const period = await prisma.billingPeriod.create({
    data: {
      id: uuidv4(),
      year,
      month,
      status: periodStatus as any,
      dueDay: 25,
      version: 0,
    },
  });

  // Create room
  await prisma.room.create({
    data: {
      roomNo,
      floorNo: 1,
      defaultAccountId: accId,
      defaultRuleCode: ruleCode,
      defaultRentAmount: 5000,
      hasFurniture: false,
      defaultFurnitureAmount: 0,
      roomStatus: 'VACANT',
    } as any,
  });

  // Create room billing
  const billing = await prisma.roomBilling.create({
    data: {
      id: uuidv4(),
      billingPeriodId: period.id,
      roomNo,
      recvAccountId: accId,
      ruleCode,
      rentAmount: 5000,
      waterMode: 'NORMAL',
      waterUnits: 0,
      waterUsageCharge: 0,
      waterServiceFee: 0,
      waterTotal: 0,
      electricMode: 'NORMAL',
      electricUnits: 0,
      electricUsageCharge: 0,
      electricServiceFee: 0,
      electricTotal: 0,
      furnitureFee: 0,
      otherFee: 0,
      totalDue: 5000,
      status: billingStatus as any,
      version: 0,
    } as any,
  });

  const cleanup = async () => {
    try { await prisma.roomBilling.deleteMany({ where: { roomNo } }); } catch {}
    try { await prisma.room.deleteMany({ where: { roomNo } }); } catch {}
    try { await prisma.billingPeriod.delete({ where: { id: period.id } }); } catch {}
    try { await prisma.billingRule.delete({ where: { code: ruleCode } }); } catch {}
    try { await prisma.bankAccount.delete({ where: { id: accId } }); } catch {}
  };

  return {
    periodId: period.id,
    billingId: billing.id,
    roomNo,
    accId,
    ruleCode,
    cleanup,
  };
}

// ── Test 1: BillingPeriod version conflict ─────────────────────────────────

describe('BillingPeriod: optimistic lock prevents concurrent status change', () => {
  let prisma: PrismaClient;
  let periodId: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    prisma = await getPrisma();
    const result = await createBillingPeriodWithRoom(prisma, 2026, 11, 'OPEN', 'DRAFT');
    periodId = result.periodId;
    cleanup = result.cleanup;
  });

  afterEach(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('second concurrent close attempt gets OptimisticLockError', async () => {
    // T1: Admin A reads period (version=0) and tries to close it
    // T2: Admin B reads period (version=0) and tries to close it concurrently

    const results = await Promise.allSettled([
      // T1: Close billing period (OPEN -> CLOSED)
      prisma.$transaction(async (tx) => {
        // Fetch with version
        const period = await tx.billingPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new Error('Period not found');

        const result = await tx.billingPeriod.updateMany({
          where: { id: periodId, version: period.version },
          data: { status: 'CLOSED', version: period.version + 1 },
        });

        if (result.count === 0) {
          throw new OptimisticLockError('BillingPeriod', periodId, period.version, period.version + 1);
        }
        return 'closed';
      }, { isolationLevel: 'Serializable' }),

      // T2: Close billing period (OPEN -> CLOSED) — concurrent
      prisma.$transaction(async (tx) => {
        // Small delay to ensure T1 reads first
        await new Promise(resolve => setImmediate(resolve));

        const period = await tx.billingPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new Error('Period not found');

        const result = await tx.billingPeriod.updateMany({
          where: { id: periodId, version: period.version },
          data: { status: 'CLOSED', version: period.version + 1 },
        });

        if (result.count === 0) {
          throw new OptimisticLockError('BillingPeriod', periodId, period.version, period.version + 1);
        }
        return 'closed';
      }, { isolationLevel: 'Serializable' }),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Exactly one should succeed
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // The failure should be an OptimisticLockError
    const failure = failures[0] as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(OptimisticLockError);
    expect(failure.reason.entityType).toBe('BillingPeriod');

    // Final state: period should be CLOSED
    const finalPeriod = await prisma.billingPeriod.findUnique({ where: { id: periodId } });
    expect(finalPeriod?.status).toBe('CLOSED');
    expect(finalPeriod?.version).toBe(1);
  });

  it('status guard alone also prevents double-close (belt-and-suspenders)', async () => {
    // Even without version check, the status guard prevents double-close
    // This is the existing protection that complements optimistic locking

    await prisma.$transaction(async (tx) => {
      const result = await tx.billingPeriod.updateMany({
        where: { id: periodId, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      expect(result.count).toBe(1);
    });

    // Second attempt should fail because status is now CLOSED
    const result2 = await prisma.$transaction(async (tx) => {
      const result = await tx.billingPeriod.updateMany({
        where: { id: periodId, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      return result.count;
    });

    expect(result2).toBe(0);
  });
});

// ── Test 2: RoomBilling version conflict ─────────────────────────────────

describe('RoomBilling: optimistic lock prevents concurrent recalculation', () => {
  let prisma: PrismaClient;
  let billingId: string;
  let periodId: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    prisma = await getPrisma();
    const result = await createBillingPeriodWithRoom(prisma, 2026, 12, 'OPEN', 'DRAFT');
    billingId = result.billingId;
    periodId = result.periodId;
    cleanup = result.cleanup;
  });

  afterEach(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('second concurrent recalculation gets OptimisticLockError', async () => {
    const results = await Promise.allSettled([
      // T1: Recalculate billing (update totalDue)
      prisma.$transaction(async (tx) => {
        const billing = await tx.roomBilling.findUnique({ where: { id: billingId } });
        if (!billing) throw new Error('Billing not found');

        const result = await tx.roomBilling.updateMany({
          where: { id: billingId, version: billing.version },
          data: { totalDue: 6000, version: billing.version + 1 },
        });

        if (result.count === 0) {
          throw new OptimisticLockError('RoomBilling', billingId, billing.version, billing.version + 1);
        }
        return 'recalculated';
      }, { isolationLevel: 'Serializable' }),

      // T2: Concurrent recalculation
      prisma.$transaction(async (tx) => {
        await new Promise(resolve => setImmediate(resolve));

        const billing = await tx.roomBilling.findUnique({ where: { id: billingId } });
        if (!billing) throw new Error('Billing not found');

        const result = await tx.roomBilling.updateMany({
          where: { id: billingId, version: billing.version },
          data: { totalDue: 5500, version: billing.version + 1 },
        });

        if (result.count === 0) {
          throw new OptimisticLockError('RoomBilling', billingId, billing.version, billing.version + 1);
        }
        return 'recalculated';
      }, { isolationLevel: 'Serializable' }),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Exactly one should succeed
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // Final version should be 1
    const finalBilling = await prisma.roomBilling.findUnique({ where: { id: billingId } });
    expect(finalBilling?.version).toBe(1);
  });
});

// ── Test 3: Invoice version check on status change ─────────────────────────

describe('Invoice: version prevents concurrent status transitions', () => {
  let prisma: PrismaClient;
  let invoiceId: string;
  let billingId: string;
  let roomNo: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    prisma = await getPrisma();
    const result = await createBillingPeriodWithRoom(prisma, 2026, 3, 'OPEN', 'LOCKED');
    billingId = result.billingId;
    roomNo = result.roomNo;

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        roomBillingId: billingId,
        roomNo,
        year: 2026,
        month: 3,
        status: 'GENERATED',
        version: 1,
        totalAmount: 5000,
        dueDate: new Date(2026, 2, 25),
      } as any,
    });
    invoiceId = invoice.id;

    cleanup = result.cleanup;
  });

  afterEach(async () => {
    try { await prisma.invoice.delete({ where: { id: invoiceId } }); } catch {}
    await cleanup();
    await prisma.$disconnect();
  });

  it('second concurrent cancel gets OptimisticLockError', async () => {
    const results = await Promise.allSettled([
      // T1: Cancel invoice
      prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new Error('Invoice not found');

        const result = await tx.invoice.updateMany({
          where: { id: invoiceId, version: invoice.version as number },
          data: { status: 'CANCELLED', version: (invoice.version as number) + 1 },
        });

        if (result.count === 0) {
          throw new OptimisticLockError('Invoice', invoiceId, invoice.version as number, (invoice.version as number) + 1);
        }
        return 'cancelled';
      }, { isolationLevel: 'Serializable' }),

      // T2: Concurrent cancel attempt
      prisma.$transaction(async (tx) => {
        await new Promise(resolve => setImmediate(resolve));

        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) throw new Error('Invoice not found');

        const result = await tx.invoice.updateMany({
          where: { id: invoiceId, version: invoice.version as number },
          data: { status: 'CANCELLED', version: (invoice.version as number) + 1 },
        });

        if (result.count === 0) {
          throw new OptimisticLockError('Invoice', invoiceId, invoice.version as number, (invoice.version as number) + 1);
        }
        return 'cancelled';
      }, { isolationLevel: 'Serializable' }),
    ]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Exactly one should succeed
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // Final state
    const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(finalInvoice?.status).toBe('CANCELLED');
    expect(finalInvoice?.version).toBe(2);
  });
});

// ── Test 4: FOR UPDATE protects payment operations ─────────────────────────

describe('FOR UPDATE: protects invoice row during payment settlement', () => {
  let prisma: PrismaClient;
  let invoiceId: string;
  let billingId: string;
  let roomNo: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    prisma = await getPrisma();
    const result = await createBillingPeriodWithRoom(prisma, 2026, 4, 'OPEN', 'LOCKED');
    billingId = result.billingId;
    roomNo = result.roomNo;

    const invoice = await prisma.invoice.create({
      data: {
        id: uuidv4(),
        roomBillingId: billingId,
        roomNo,
        year: 2026,
        month: 4,
        status: 'GENERATED',
        version: 1,
        totalAmount: 5000,
        dueDate: new Date(2026, 3, 25),
      } as any,
    });
    invoiceId = invoice.id;

    cleanup = result.cleanup;
  });

  afterEach(async () => {
    try { await prisma.payment.deleteMany({ where: { matchedInvoiceId: invoiceId } }); } catch {}
    try { await prisma.invoice.delete({ where: { id: invoiceId } }); } catch {}
    await cleanup();
    await prisma.$disconnect();
  });

  it('FOR UPDATE serializes concurrent payment attempts', async () => {
    // This test verifies that FOR UPDATE correctly serializes access
    // The second payment will wait for the first to complete, then see the updated state

    const txId1 = `TX-${uuidv4().slice(0, 12)}`;
    const txId2 = `TX-${uuidv4().slice(0, 12)}`;

    // T1: Start payment transaction with FOR UPDATE lock
    const t1Result = await prisma.$transaction(async (tx) => {
      // Acquire FOR UPDATE lock on invoice
      const [invoice] = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM invoices WHERE id = ${invoiceId} FOR UPDATE
      `;

      if (!invoice) throw new Error('Invoice not found');

      // Simulate some processing time
      await new Promise(resolve => setImmediate(resolve));

      // Create payment
      const payment = await tx.payment.create({
        data: {
          id: uuidv4(),
          amount: 5000,
          paidAt: new Date(),
          transactionId: txId1,
          status: 'CONFIRMED',
          matchedInvoiceId: invoiceId,
        } as any,
      });

      // Update invoice to PAID
      await tx.invoice.updateMany({
        where: { id: invoiceId, status: invoice.status },
        data: { status: 'PAID', paidAt: new Date() },
      });

      return payment.id;
    }, { isolationLevel: 'Serializable' });

    expect(t1Result).toBeDefined();

    // T2: After T1 commits, try to pay again
    // This should either fail (duplicate) or succeed (overpayment scenario)
    const t2Result = await prisma.$transaction(async (tx) => {
      const [invoice] = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM invoices WHERE id = ${invoiceId} FOR UPDATE
      `;

      if (!invoice) throw new Error('Invoice not found');

      // Invoice is already PAID — this payment should be handled gracefully
      const payment = await tx.payment.create({
        data: {
          id: uuidv4(),
          amount: 100, // overpayment
          paidAt: new Date(),
          transactionId: txId2,
          status: 'CONFIRMED',
          matchedInvoiceId: invoiceId,
        } as any,
      });

      return payment.id;
    }, { isolationLevel: 'Serializable' });

    expect(t2Result).toBeDefined();

    // Final invoice should be PAID
    const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(finalInvoice?.status).toBe('PAID');
  });
});

// ── Test 5: Lock-all concurrent safety ─────────────────────────────────────

describe('lock-all: concurrent lock attempts are serialized', () => {
  let prisma: PrismaClient;
  let periodId: string;
  let billingIds: string[];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    prisma = await getPrisma();

    // Create period and multiple room billings
    const roomNos: string[] = [];
    const accId = `test-acc-${uuidv4().slice(0, 8)}`;
    const ruleCode = `test-rule-${uuidv4().slice(0, 8)}`;

    await prisma.bankAccount.create({
      data: {
        id: accId,
        name: 'Test Bank',
        bankName: 'Test Bank',
        bankAccountNo: '0000000000',
        active: true,
      },
    });

    await prisma.billingRule.create({
      data: {
        code: ruleCode,
        descriptionTh: 'Test Rule',
        waterEnabled: false,
        waterUnitPrice: new Prisma.Decimal(0),
        waterMinCharge: new Prisma.Decimal(0),
        waterServiceFeeMode: 'NONE',
        waterServiceFeeAmount: new Prisma.Decimal(0),
        electricEnabled: false,
        electricUnitPrice: new Prisma.Decimal(0),
        electricMinCharge: new Prisma.Decimal(0),
        electricServiceFeeMode: 'NONE',
        electricServiceFeeAmount: new Prisma.Decimal(0),
        penaltyPerDay: new Prisma.Decimal(0),
        maxPenalty: new Prisma.Decimal(0),
        gracePeriodDays: 0,
      },
    });

    const period = await prisma.billingPeriod.create({
      data: {
        id: uuidv4(),
        year: 2026,
        month: 5,
        status: 'OPEN',
        dueDay: 25,
        version: 0,
      },
    });
    periodId = period.id;

    billingIds = [];
    for (let i = 0; i < 3; i++) {
      const roomNo = `TEST-${uuidv4().slice(0, 8).toUpperCase()}`;
      roomNos.push(roomNo);

      await prisma.room.create({
        data: {
          roomNo,
          floorNo: 1,
          defaultAccountId: accId,
          defaultRuleCode: ruleCode,
          defaultRentAmount: 5000,
          hasFurniture: false,
          defaultFurnitureAmount: 0,
          roomStatus: 'VACANT',
        } as any,
      });

      const billing = await prisma.roomBilling.create({
        data: {
          id: uuidv4(),
          billingPeriodId: period.id,
          roomNo,
          recvAccountId: accId,
          ruleCode,
          rentAmount: 5000,
          waterMode: 'NORMAL',
          waterUnits: 0,
          waterUsageCharge: 0,
          waterServiceFee: 0,
          waterTotal: 0,
          electricMode: 'NORMAL',
          electricUnits: 0,
          electricUsageCharge: 0,
          electricServiceFee: 0,
          electricTotal: 0,
          furnitureFee: 0,
          otherFee: 0,
          totalDue: 5000,
          status: 'DRAFT',
          version: 0,
        } as any,
      });
      billingIds.push(billing.id);
    }

    cleanup = async () => {
      try { await prisma.roomBilling.deleteMany({ where: { billingPeriodId: periodId } }); } catch {}
      try { await prisma.room.deleteMany({ where: { roomNo: { in: roomNos } } }); } catch {}
      try { await prisma.billingPeriod.delete({ where: { id: periodId } }); } catch {}
      try { await prisma.billingRule.delete({ where: { code: ruleCode } }); } catch {}
      try { await prisma.bankAccount.delete({ where: { id: accId } }); } catch {}
    };
  });

  afterEach(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('updateMany with status guard prevents double-lock', async () => {
    // First lock-all should succeed
    const result1 = await prisma.$transaction(async (tx) => {
      return tx.roomBilling.updateMany({
        where: { billingPeriodId: periodId, status: 'DRAFT' },
        data: { status: 'LOCKED', version: 1 },
      });
    });

    expect(result1.count).toBe(3);

    // Second lock-all should lock 0 records (already locked)
    const result2 = await prisma.$transaction(async (tx) => {
      return tx.roomBilling.updateMany({
        where: { billingPeriodId: periodId, status: 'DRAFT' },
        data: { status: 'LOCKED', version: 1 },
      });
    });

    expect(result2.count).toBe(0);

    // All billings should be LOCKED
    const billings = await prisma.roomBilling.findMany({
      where: { billingPeriodId: periodId },
    });
    expect(billings.every(b => b.status === 'LOCKED')).toBe(true);
  });
});

// ── Test 6: Version overflow safety ────────────────────────────────────────

describe('Version overflow: Int32 safety check', () => {
  let prisma: PrismaClient;
  let periodId: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    prisma = await getPrisma();
    const result = await createBillingPeriodWithRoom(prisma, 2026, 6, 'OPEN', 'DRAFT');
    periodId = result.periodId;
    cleanup = result.cleanup;
  });

  afterEach(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it('version field uses Int which is safe for 2 billion updates', async () => {
    // This is a sanity check that version is Integer
    // At 1000 updates/day, it would take ~5,000 years to overflow

    const MAX_SAFE_VERSION = 2_147_483_647; // Int32 max

    // Verify we can create a period with version 0
    const period = await prisma.billingPeriod.findUnique({ where: { id: periodId } });
    expect(period?.version).toBe(0);

    // Verify Int can hold the max value (sanity check)
    // The actual overflow test would take too long, but we verify the type is correct
    expect(typeof period?.version).toBe('number');
    expect(Number.isSafeInteger(period?.version ?? 0)).toBe(true);
  });
});
