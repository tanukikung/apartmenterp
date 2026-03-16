import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();

process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Payment flow', () => {
  it('generates invoice and marks it PAID after payment', async () => {
    const [{ prisma }, { getInvoiceService }] = await Promise.all([
      import('@/lib/db/client'),
      import('@/modules/invoices/invoice.service'),
    ]);
    const { getPaymentService } = await import('@/modules/payments/payment.service');
    try {
      await prisma.$connect();
    } catch {
      return;
    }

    const building = await prisma.building.create({
      data: { id: crypto.randomUUID(), name: 'Tower B', address: 'Y', totalFloors: 10 },
    });
    const floor = await prisma.floor.create({
      data: { id: crypto.randomUUID(), buildingId: building.id, floorNumber: 2 },
    });
    const room = await prisma.room.create({
      data: { id: crypto.randomUUID(), floorId: floor.id, roomNumber: '201', status: 'VACANT', maxResidents: 2 },
    });
    await prisma.billingItemType.create({
      data: { id: crypto.randomUUID(), code: 'RENT', name: 'Rent', isRecurring: true, defaultAmount: 4200 as unknown as any },
    });
    const billing = await prisma.billingRecord.create({
      data: {
        id: crypto.randomUUID(),
        roomId: room.id,
        year: 2026,
        month: 3,
        billingDay: 1,
        dueDay: 5,
        overdueDay: 15,
        status: 'LOCKED',
        subtotal: 4200 as unknown as any,
        lockedAt: new Date(),
        lockedBy: 'system',
      },
    });
    const itemType = await prisma.billingItemType.findUnique({ where: { code: 'RENT' } });
    await prisma.billingItem.create({
      data: {
        id: crypto.randomUUID(),
        billingRecordId: billing.id,
        itemTypeId: itemType!.id,
        description: 'Rent',
        quantity: 1 as unknown as any,
        unitPrice: 4200 as unknown as any,
        amount: 4200 as unknown as any,
        isEditable: false,
      },
    });

    const invSvc = getInvoiceService();
    const invoice = await invSvc.generateInvoiceFromBilling(billing.id);
    const paymentSvc = getPaymentService();
    const result = await paymentSvc.createPayment({
      invoiceId: invoice.id,
      amount: invoice.totalAmount,
      method: 'PROMPTPAY',
      referenceNumber: 'R-123',
    } as any);

    expect(result.invoice.status).toBe('PAID');
  });
});
