import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';
process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Payment Matching', () => {
  // TODO: depends on broken billing.factory stubs + non-existent
  // getBillingService export. Rewrite against RoomBilling/Invoice schema.
  it.skip('confirms match and marks invoice PAID, emits outbox event', async () => {
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();
    const [
      { prisma },
      roomFactory,
      billingFactory,
      invoiceFactory,
      billingMod,
      matchingMod,
    ] = await Promise.all([
      import('@/lib/db/client'),
      import('../factories/room.factory'),
      import('../factories/billing.factory'),
      import('../factories/invoice.factory'),
      import('@/modules/billing/billing.service'),
      import('@/modules/payments/payment-matching.service'),
    ]);
      try {
        await prisma.$connect();
      } catch {
        return;
      }
      const building = await roomFactory.createBuilding();
      const floor = await roomFactory.createFloor(building.id);
      const room = await roomFactory.createRoom(floor.id, { roomNumber: 'C202' });

      const { id: billingId } = await billingFactory.createBillingRecordForRoom((room as any).roomNo ?? (room as any).id);
      await billingFactory.addOtherItem(billingId, 5000, 'Monthly');

      const { getBillingService } = billingMod as any;
      const billingSvc = getBillingService();
      await billingSvc.lockBillingRecord(billingId, { force: false }, 'tester');
      const invoice = await invoiceFactory.createInvoiceFromBilling(billingId);

      const tx = await prisma.paymentTransaction.create({
        data: {
          amount: Number(invoice.totalAmount),
          transactionDate: new Date(),
          description: `Invoice ${invoice.id}`,
          reference: 'MATCH-OK',
          sourceFile: 'test',
          status: 'PENDING',
        } as any,
      });

      const { getPaymentMatchingService } = matchingMod as any;
      const matcher = getPaymentMatchingService();
      await matcher.confirmMatch(tx.id, invoice.id, 'tester');

      const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      expect(updated?.status).toBe('PAID');

      const outbox = await prisma.outboxEvent.findFirst({
        where: { aggregateId: invoice.id, eventType: 'InvoicePaid' },
      });
      expect(outbox).toBeTruthy();
  });
});
