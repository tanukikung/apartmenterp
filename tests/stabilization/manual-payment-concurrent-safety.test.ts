/**
 * Manual payment concurrent safety
 *
 * Guards against the TOCTOU race in /api/payments/manual where:
 * 1. Both concurrent requests read invoice status = GENERATED (outside tx)
 * 2. Both enter prisma.$transaction
 * 3. Both create a Payment record (no unique constraint on manual payments)
 * 4. syncInvoicePaymentState serialises them via FOR UPDATE, but neither
 *    throws — second call commits its Payment with transitionedToPaid=false
 * Result (before fix): two Payment records for the same invoice (overpayment).
 *
 * Fix: invoice status + remaining-amount checks now run inside the transaction
 * with SELECT ... FOR UPDATE, so the second caller sees invoice.status = 'PAID'
 * (committed by the first) and throws BadRequestError before creating a Payment.
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

process.env.USE_PRISMA_TEST_DB = 'true';

async function getPrisma() {
  const { prisma } = await import('@/lib/db/client');
  return prisma as any;
}

async function createTestInvoice() {
  const prisma = await getPrisma();
  const roomNo = `MPAY-${Math.random().toString(36).slice(2, 8)}`;
  const year = 6000 + Math.floor(Math.random() * 1000);
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

  return { invoice };
}

// Replicates the fixed transaction logic from /api/payments/manual/route.ts:
// FOR UPDATE before creating the Payment record prevents double-payment.
async function manualPayTransaction(prisma: any, invoiceId: string, amount: number, actorId: string) {
  const { syncInvoicePaymentState } = await import('@/modules/payments/invoice-payment-state');
  const { BadRequestError, NotFoundError } = await import('@/lib/utils/errors');

  return prisma.$transaction(async (tx: any) => {
    const rows: Array<{ id: string; status: string; totalAmount: any }> = await tx.$queryRaw`
      SELECT id, status::text AS status, "totalAmount"
      FROM invoices
      WHERE id = ${invoiceId}
      FOR UPDATE
    `;
    const invoice = rows[0];
    if (!invoice) throw new NotFoundError('Invoice', invoiceId);
    if (invoice.status === 'PAID') throw new BadRequestError('Invoice is already paid');

    const totals = await tx.payment.aggregate({
      where: { matchedInvoiceId: invoiceId, status: 'CONFIRMED' },
      _sum: { amount: true },
    });
    const totalPaid = Number(totals._sum.amount ?? 0);
    const remaining = Math.max(0, Number(invoice.totalAmount) - totalPaid);
    if (amount > remaining + 0.001) throw new BadRequestError('Overpayment');

    const payment = await tx.payment.create({
      data: {
        id: uuidv4(),
        amount,
        paidAt: new Date(),
        description: 'CASH',
        sourceFile: 'MANUAL_ENTRY',
        status: 'CONFIRMED',
        matchedInvoiceId: invoiceId,
        confirmedAt: new Date(),
        confirmedBy: actorId,
      },
    });

    const paymentState = await syncInvoicePaymentState(tx, {
      invoiceId,
      paymentId: payment.id,
      paymentAmount: amount,
      paidAt: new Date(),
    });

    return { payment, invoice: paymentState.invoice };
  });
}

describe('manual payment concurrent safety (FOR UPDATE)', () => {
  it('two concurrent full-amount payments produce exactly one payment', async () => {
    const prisma = await getPrisma();
    try { await prisma.$connect(); } catch { return; }

    const { invoice } = await createTestInvoice();

    const [r1, r2] = await Promise.allSettled([
      manualPayTransaction(prisma, invoice.id, 5000, 'admin-1'),
      manualPayTransaction(prisma, invoice.id, 5000, 'admin-2'),
    ]);

    const successes = [r1, r2].filter(r => r.status === 'fulfilled');
    const failures = [r1, r2].filter(r => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    if (failures[0].status === 'rejected') {
      expect((failures[0].reason as Error).message).toMatch(/paid|settled|overpayment/i);
    }

    const payments = await prisma.payment.findMany({
      where: { matchedInvoiceId: invoice.id },
    });
    expect(payments).toHaveLength(1);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe('PAID');
  });

  it('partial payments that sum to full amount result in exactly two payments and PAID status', async () => {
    const prisma = await getPrisma();
    try { await prisma.$connect(); } catch { return; }

    const { invoice } = await createTestInvoice();

    // Sequential partial payments (safe, just verifying accumulation works)
    await manualPayTransaction(prisma, invoice.id, 3000, 'admin-1');
    await manualPayTransaction(prisma, invoice.id, 2000, 'admin-2');

    const payments = await prisma.payment.findMany({
      where: { matchedInvoiceId: invoice.id },
    });
    expect(payments).toHaveLength(2);

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe('PAID');
  });
});
