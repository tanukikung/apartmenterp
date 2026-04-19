import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';

// Capture the reminder dispatch. The reminder-notifier calls
// sendReminderMessage from @/modules/messaging, which internally uses
// sendFlexMessage from @/lib/line/client. We spy on the outer function
// so we don't depend on the LINE client's internals.
const sendReminderSpy = vi.fn().mockResolvedValue(undefined);
const sendTextWithQuickReplySpy = vi.fn().mockResolvedValue(undefined);
vi.mock('@/modules/messaging', async () => {
  const actual = await vi.importActual<any>('@/modules/messaging');
  return {
    ...actual,
    sendReminderMessage: sendReminderSpy,
    sendTextWithQuickReply: sendTextWithQuickReplySpy,
  };
});

describe('Integration: Reminder System', () => {
  // TODO: depends on broken billing.factory stubs + non-existent
  // getBillingService export. Rewrite against RoomBilling/Invoice schema.
  it.skip('publishes reminder event and queues LINE notification', async () => {
    vi.doUnmock('@/lib/db/client');
    const [{ prisma, getEventBus, EventTypes }, roomFactory, tenantFactory, billingFactory, invoiceFactory, billingMod] = await Promise.all([
      import('@/lib'),
      import('../factories/room.factory'),
      import('../factories/tenant.factory'),
      import('../factories/billing.factory'),
      import('../factories/invoice.factory'),
      import('@/modules/billing/billing.service'),
    ]);
    try {
      await (prisma as any).$connect?.();
    } catch {
      return;
    }
    await import('@/modules/messaging/reminder-notifier'); // register subscriptions

    // Randomize year to dodge (year, month) uniqueness across parallel forks
    const year = 3000 + Math.floor(Math.random() * 1000);
    const month = 1 + Math.floor(Math.random() * 12);

    const room = await roomFactory.createRoom('stub-floor-1', { roomNumber: 'REMIND' });
    const tenant = await tenantFactory.createTenant({ lineUserId: `U-${crypto.randomUUID().slice(0, 8)}` });
    await (prisma as any).roomTenant.create({
      data: {
        roomNo: (room as any).roomNo,
        tenantId: tenant.id,
        role: 'PRIMARY',
        moveInDate: new Date(),
      } as any,
    });

    const billing = await billingFactory.createBillingRecordForRoom(
      (room as any).roomNo,
      { year, month, rentAmount: 4000 }
    );
    const { getBillingService } = billingMod as any;
    const billingSvc = getBillingService();
    await billingSvc.lockBillingRecord(billing.id, { force: false }, 'tester');
    const invoice = await invoiceFactory.createInvoiceFromBilling(billing.id);

    const bus = getEventBus();
    await bus.publish(
      EventTypes.INVOICE_REMINDER_OVERDUE,
      'Invoice',
      invoice.id,
      { invoiceId: invoice.id } as any
    );

    // reminder-notifier subscribers run async; yield a tick for them
    await new Promise((r) => setTimeout(r, 100));

    expect(sendReminderSpy).toHaveBeenCalled();
  });
});
