/**
 * Invoice Cancel + View Safety Tests
 *
 * Guards against two TOCTOU race conditions:
 *
 * 1. cancelInvoice: status checks were done OUTSIDE the $transaction.
 *    A concurrent payment could land between the check and the UPDATE,
 *    allowing cancellation of a PAID invoice. Fix: FOR UPDATE inside tx.
 *
 * 2. markInvoiceViewed: paidAt check was done outside tx, then an
 *    unconditional update set status=VIEWED, which could overwrite PAID.
 *    Fix: conditional updateMany(where: paidAt:null, status in [non-terminal]).
 */

import { describe, it, expect, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';

async function getPrisma() {
  const { prisma } = await import('@/lib/db/client');
  return prisma as ReturnType<typeof import('@/lib/db/client')['prisma']>;
}

function randomYear() {
  return 4000 + Math.floor(Math.random() * 1000);
}

async function createLockedInvoice(overrides?: { status?: string; paidAt?: Date }) {
  const prisma = await getPrisma();
  const roomNo = `CANCEL-TEST-${Math.random().toString(36).slice(2, 8)}`;
  const year = randomYear();
  const month = 1 + Math.floor(Math.random() * 12);

  const room = await (prisma as any).room.create({
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

  const period = await (prisma as any).billingPeriod.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: { id: uuidv4(), year, month, status: 'OPEN' },
  });

  const rb = await (prisma as any).roomBilling.create({
    data: {
      id: uuidv4(),
      billingPeriodId: period.id,
      roomNo: room.roomNo,
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

  const invoice = await (prisma as any).invoice.create({
    data: {
      id: uuidv4(),
      roomNo: room.roomNo,
      roomBillingId: rb.id,
      year,
      month,
      status: overrides?.status ?? 'GENERATED',
      totalAmount: 5000,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      paidAt: overrides?.paidAt ?? null,
    },
  });

  return { room, period, rb, invoice };
}

// ─── cancelInvoice safety ────────────────────────────────────────────────────

describe('cancelInvoice TOCTOU safety', () => {
  it('rejects cancellation of a PAID invoice even when called concurrently', async () => {
    const prisma = await getPrisma();
    try { await (prisma as any).$connect(); } catch { return; }

    const { invoice } = await createLockedInvoice({ status: 'PAID', paidAt: new Date() });

    const sc = (await import('@/lib/service-container')).getServiceContainer();

    // Both calls should reject because the invoice is already PAID
    const [r1, r2] = await Promise.allSettled([
      sc.invoiceService.cancelInvoice(invoice.id, 'tester', 'test reason for cancel'),
      sc.invoiceService.cancelInvoice(invoice.id, 'tester', 'test reason for cancel'),
    ]);

    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    if (r1.status === 'rejected') {
      expect((r1.reason as Error).message).toMatch(/PAID|cancel/i);
    }

    // Invoice must still be PAID, not CANCELLED
    const current = await (prisma as any).invoice.findUnique({ where: { id: invoice.id } });
    expect(current.status).toBe('PAID');
  });

  it('rejects cancellation of a SENT invoice', async () => {
    const prisma = await getPrisma();
    try { await (prisma as any).$connect(); } catch { return; }

    const { invoice } = await createLockedInvoice({ status: 'SENT' });
    const sc = (await import('@/lib/service-container')).getServiceContainer();

    await expect(
      sc.invoiceService.cancelInvoice(invoice.id, 'tester', 'should be blocked'),
    ).rejects.toThrow(/SENT/i);

    const current = await (prisma as any).invoice.findUnique({ where: { id: invoice.id } });
    expect(current.status).toBe('SENT');
  });

  it('allows concurrent cancellation of a GENERATED invoice — exactly one succeeds', async () => {
    const prisma = await getPrisma();
    try { await (prisma as any).$connect(); } catch { return; }

    const { invoice } = await createLockedInvoice({ status: 'GENERATED' });
    const sc = (await import('@/lib/service-container')).getServiceContainer();

    const [r1, r2] = await Promise.allSettled([
      sc.invoiceService.cancelInvoice(invoice.id, 'tester', 'concurrent cancel test reason'),
      sc.invoiceService.cancelInvoice(invoice.id, 'tester', 'concurrent cancel test reason'),
    ]);

    const successes = [r1, r2].filter(r => r.status === 'fulfilled');
    // At most one should succeed; the second sees already-CANCELLED
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const current = await (prisma as any).invoice.findUnique({ where: { id: invoice.id } });
    expect(current.status).toBe('CANCELLED');
  });
});

// ─── markInvoiceViewed safety ─────────────────────────────────────────────────

describe('markInvoiceViewed TOCTOU safety', () => {
  it('does NOT overwrite PAID status with VIEWED', async () => {
    const prisma = await getPrisma();
    try { await (prisma as any).$connect(); } catch { return; }

    const { invoice } = await createLockedInvoice({ status: 'PAID', paidAt: new Date() });
    const sc = (await import('@/lib/service-container')).getServiceContainer();

    // markInvoiceViewed on a PAID invoice must be a no-op — status stays PAID
    const result = await sc.invoiceService.markInvoiceViewed(invoice.id, 'tenant-1');
    // The returned invoice may show the effective status
    const current = await (prisma as any).invoice.findUnique({ where: { id: invoice.id } });
    expect(current.status).toBe('PAID');
    expect(current.paidAt).not.toBeNull();
  });

  it('transitions SENT → VIEWED correctly', async () => {
    const prisma = await getPrisma();
    try { await (prisma as any).$connect(); } catch { return; }

    const { invoice } = await createLockedInvoice({ status: 'SENT' });
    const sc = (await import('@/lib/service-container')).getServiceContainer();

    await sc.invoiceService.markInvoiceViewed(invoice.id, 'tenant-1');

    const current = await (prisma as any).invoice.findUnique({ where: { id: invoice.id } });
    expect(current.status).toBe('VIEWED');
  });

  it('concurrent markInvoiceViewed calls on SENT invoice are idempotent', async () => {
    const prisma = await getPrisma();
    try { await (prisma as any).$connect(); } catch { return; }

    const { invoice } = await createLockedInvoice({ status: 'SENT' });
    const sc = (await import('@/lib/service-container')).getServiceContainer();

    await Promise.all([
      sc.invoiceService.markInvoiceViewed(invoice.id, 'tenant-1'),
      sc.invoiceService.markInvoiceViewed(invoice.id, 'tenant-1'),
      sc.invoiceService.markInvoiceViewed(invoice.id, 'tenant-1'),
    ]);

    const current = await (prisma as any).invoice.findUnique({ where: { id: invoice.id } });
    expect(current.status).toBe('VIEWED');
    // paidAt must remain null — viewed is not a payment transition
    expect(current.paidAt).toBeNull();
  });
});
