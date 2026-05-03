/**
 * settleOutstandingBalance concurrent safety
 *
 * Before the fix, `settleOutstandingBalance` used a Prisma `for:'update'` option
 * that Prisma silently ignores at runtime, leaving the row unlocked. Two concurrent
 * calls could both pass the PAID check and create two Payment records for the same
 * invoice, resulting in double-settlement.
 *
 * After the fix, the function uses raw `SELECT ... FOR UPDATE` which serialises
 * concurrent callers. The second caller sees the invoice already PAID (committed
 * by the first) and throws BadRequestError('Invoice is already settled').
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

process.env.USE_PRISMA_TEST_DB = 'true';

async function getPrisma() {
  const { prisma } = await import('@/lib/db/client');
  return prisma as any;
}

async function createInvoiceAndBilling() {
  const prisma = await getPrisma();
  const roomNo = `SETTLE-${Math.random().toString(36).slice(2, 8)}`;
  const year = 5000 + Math.floor(Math.random() * 1000);
  const month = 1 + Math.floor(Math.random() * 12);

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

  const period = await prisma.billingPeriod.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { id: uuidv4(), year, month, status: 'OPEN' },
  });

  const rb = await prisma.roomBilling.create({
    data: {
      id: uuidv4(),
      billingPeriodId: period.id,
      roomNo,
      recvAccountId: 'ACC_F1',
      ruleCode: 'STANDARD',
      rentAmount: 5000,
      waterMode: 'NORMAL', waterUnits: 0, waterUsageCharge: 0, waterServiceFee: 0, waterTotal: 0,
      electricMode: 'NORMAL', electricUnits: 0, electricUsageCharge: 0, electricServiceFee: 0, electricTotal: 0,
      furnitureFee: 0, otherFee: 0,
      totalDue: 5000,
      status: 'LOCKED',
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      id: uuidv4(),
      roomNo,
      roomBillingId: rb.id,
      year,
      month,
      status: 'GENERATED',
      totalAmount: 5000,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return { roomNo, invoice };
}

describe('settleOutstandingBalance concurrent safety', () => {
  it('two concurrent settleOutstandingBalance calls produce exactly one payment', async () => {
    const prisma = await getPrisma();
    try { await prisma.$connect(); } catch { return; }

    const { invoice } = await createInvoiceAndBilling();
    const sc = (await import('@/lib/service-container')).getServiceContainer();

    // Fire two concurrent settlement calls on the same invoice
    const [r1, r2] = await Promise.allSettled([
      sc.paymentService.settleOutstandingBalance(invoice.id, {}, 'tester-1'),
      sc.paymentService.settleOutstandingBalance(invoice.id, {}, 'tester-2'),
    ]);

    const successes = [r1, r2].filter(r => r.status === 'fulfilled');
    const failures = [r1, r2].filter(r => r.status === 'rejected');

    // Exactly one must succeed, the other must be rejected with "already settled"
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    if (failures[0].status === 'rejected') {
      expect((failures[0].reason as Error).message).toMatch(/settled|paid/i);
    }

    // Exactly one Payment must exist for this invoice
    const payments = await prisma.payment.findMany({
      where: { matchedInvoiceId: invoice.id },
    });
    expect(payments).toHaveLength(1);

    // Invoice must be PAID
    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe('PAID');
  });
});
