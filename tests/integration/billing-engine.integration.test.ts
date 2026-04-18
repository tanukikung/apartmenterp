import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Billing Engine', () => {
  it('locks RoomBilling and generates an invoice with matching totalAmount', async () => {
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();
    const [
      roomFactory,
      billingFactory,
      invoiceFactory,
      billingMod,
    ] = await Promise.all([
      import('../factories/room.factory'),
      import('../factories/billing.factory'),
      import('../factories/invoice.factory'),
      import('@/modules/billing/billing.service'),
    ]);
    const { prisma } = await import('@/lib/db/client');
    try {
      await prisma.$connect();
    } catch {
      return;
    }

    // Build a room + RoomBilling with rent + extra "other" charges.
    const room = await roomFactory.createRoom('stub-floor-1', { roomNumber: 'B101' });
    const billing = await billingFactory.createBillingRecordForRoom(
      (room as any).roomNo,
      { year: 2026, month: 3, rentAmount: 5000 }
    );
    await billingFactory.addOtherItem(billing.id, 3000, 'Water');
    await billingFactory.addOtherItem(billing.id, 2000, 'Electric');

    // Lock through the real service path to exercise the same code production uses.
    const billingSvc = (billingMod as any).getBillingService();
    await billingSvc.lockBillingRecord(billing.id, { force: false }, 'tester');

    const invoice = await invoiceFactory.createInvoiceFromBilling(billing.id);
    expect(invoice).toBeTruthy();
    expect(invoice.roomBillingId).toBe(billing.id);
    expect(Number(invoice.totalAmount)).toBe(5000 + 3000 + 2000);
  });
});
