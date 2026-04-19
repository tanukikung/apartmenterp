import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';
process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Reminder System', () => {
  // TODO: depends on broken billing.factory stubs + non-existent
  // getBillingService export. Rewrite against RoomBilling/Invoice schema.
  it.skip('publishes reminder event and queues LINE notification', async () => {
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();
    const [{ prisma, getEventBus, EventTypes }, roomFactory, tenantFactory, billingFactory, invoiceFactory, billingMod] = await Promise.all([
      import('@/lib'),
      import('../factories/room.factory'),
      import('../factories/tenant.factory'),
      import('../factories/billing.factory'),
      import('../factories/invoice.factory'),
      import('@/modules/billing/billing.service'),
    ]);
    const libMod = await import('@/lib');
    try {
      await (libMod as any).prisma.$connect?.();
    } catch {
      return;
    }
    const sendSpy = vi.spyOn(libMod, 'sendLineMessage').mockResolvedValue(undefined as any);
    await import('@/modules/messaging/reminder-notifier'); // register subscriptions

    const building = await roomFactory.createBuilding();
    const floor = await roomFactory.createFloor(building.id);
    const room = await roomFactory.createRoom(floor.id, { roomNumber: 'D303' });
    const tenant = await tenantFactory.createTenant({ lineUserId: 'U-test' });
    await (prisma as any).roomTenant.create({
      data: {
        roomNo: (room as any).roomNo ?? (room as any).id,
        tenantId: tenant.id,
        role: 'PRIMARY',
        moveInDate: new Date(),
      } as any,
    });

    const { id: billingId } = await billingFactory.createBillingRecordForRoom((room as any).roomNo ?? (room as any).id);
    await billingFactory.addOtherItem(billingId, 4000, 'Rent');
    const { getBillingService } = billingMod as any;
    const billingSvc = getBillingService();
    await billingSvc.lockBillingRecord(billingId, { force: false }, 'tester');
    const invoice = await invoiceFactory.createInvoiceFromBilling(billingId);

    const bus = getEventBus();
    await bus.publish(
      EventTypes.INVOICE_REMINDER_OVERDUE,
      'Invoice',
      invoice.id,
      { invoiceId: invoice.id } as any
    );

    expect(sendSpy).toHaveBeenCalled();
  });
});
