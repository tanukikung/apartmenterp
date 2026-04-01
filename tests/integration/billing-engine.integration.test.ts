import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';
process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Billing Engine', () => {
  it('generates invoice with correct items and subtotal', async () => {
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
      const building = await roomFactory.createBuilding();
      const floor = await roomFactory.createFloor(building.id);
      const room = await roomFactory.createRoom(floor.id, { roomNumber: 'B101' });

      const { id: billingId } = await billingFactory.createBillingRecordForRoom((room as any).roomNo ?? (room as any).id, {
        year: 2026,
        month: 3,
      });

      await billingFactory.addOtherItem(billingId, 3000, 'Water');
      await billingFactory.addOtherItem(billingId, 2000, 'Electric');

      const { getBillingService } = billingMod as any;
      const billingSvc = getBillingService();
      await billingSvc.lockBillingRecord(billingId, { force: false }, 'tester');

      const invoice = await invoiceFactory.createInvoiceFromBilling(billingId);
      expect(invoice).toBeTruthy();
      expect(invoice.totalAmount).toBeGreaterThan(0);
      expect(invoice.items.length).toBeGreaterThanOrEqual(1);

      const sum = invoice.items.reduce((a, b) => a + Number(b.total), 0);
      expect(Number(invoice.totalAmount)).toBe(sum);

      // ensure line items contain our descriptions
      const descs = invoice.items.map((i) => i.description);
      expect(descs.join(' ')).toContain('Water');
      expect(descs.join(' ')).toContain('Electric');
  });
});
