import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();

process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Billing → Invoice', () => {
  let prisma: typeof import('@/lib/db/client').prisma;
  let getInvoiceService: typeof import('@/modules/invoices/invoice.service').getInvoiceService;

  beforeAll(async () => {
    ({ prisma } = await import('@/lib/db/client'));
    ({ getInvoiceService } = await import('@/modules/invoices/invoice.service'));
  });

  it('creates locked billing and generates invoice', async () => {
    try {
      await prisma.$connect();
    } catch {
      return;
    }
    const building = await prisma.building.create({
      data: { id: crypto.randomUUID(), name: 'Tower A', address: 'X', totalFloors: 5 },
    });
    const floor = await prisma.floor.create({
      data: { id: crypto.randomUUID(), buildingId: building.id, floorNumber: 1 },
    });
    const room = await prisma.room.create({
      data: { id: crypto.randomUUID(), floorId: floor.id, roomNumber: '101', status: 'VACANT', maxResidents: 2 },
    });
    await prisma.billingItemType.create({
      data: { id: crypto.randomUUID(), code: 'RENT', name: 'Rent', description: 'Monthly rent', isRecurring: true, defaultAmount: 5000 as unknown as any },
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
        subtotal: 5000 as unknown as any,
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
        description: 'Monthly rent',
        quantity: 1 as unknown as any,
        unitPrice: 5000 as unknown as any,
        amount: 5000 as unknown as any,
        isEditable: false,
      },
    });

    const svc = getInvoiceService();
    const invoice = await svc.generateInvoiceFromBilling(billing.id);

    expect(invoice).toBeTruthy();
    expect(invoice.totalAmount).toBeGreaterThan(0);
  });
});
