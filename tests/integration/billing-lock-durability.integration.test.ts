import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Billing lock durability', () => {
  // TODO: same root cause as billing-engine.integration — billing.factory is
  // a stub after schema migration, and billingModule.getBillingService no
  // longer exists (billing service moved to createBillingService / service
  // container). Rewrite against RoomBilling schema before re-enabling.
  it.skip('locks the billing record and writes durable outbox events for invoice generation', async () => {
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();

    const [
      { prisma, EventTypes },
      roomFactory,
      billingFactory,
      billingModule,
    ] = await Promise.all([
      import('@/lib'),
      import('../factories/room.factory'),
      import('../factories/billing.factory'),
      import('@/modules/billing/billing.service'),
    ]);

    try {
      await prisma.$connect();
    } catch {
      return;
    }

    const building = await roomFactory.createBuilding();
    const floor = await roomFactory.createFloor(building.id);
    const room = await roomFactory.createRoom(floor.id, { roomNumber: 'D401' });
    const billingRecord = await billingFactory.createBillingRecordForRoom((room as any).roomNo ?? (room as any).id, {
      year: 2026,
      month: 3,
    });

    await billingFactory.addOtherItem(billingRecord.id, 3200, 'Monthly rent');

    const billingService = (billingModule as any).getBillingService();
    await billingService.lockBillingRecord(billingRecord.id, { force: false }, 'durability-tester');

    const lockedRecord = await (prisma as any).roomBilling.findUnique({
      where: { id: billingRecord.id },
    });
    expect(lockedRecord?.status).toBe('LOCKED');

    const durableEvents = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: billingRecord.id,
        eventType: {
          in: [EventTypes.BILLING_LOCKED, EventTypes.INVOICE_GENERATION_REQUESTED],
        },
      },
      orderBy: { eventType: 'asc' },
    });

    expect(durableEvents.map((event: any) => event.eventType).sort()).toEqual([
      EventTypes.BILLING_LOCKED,
      EventTypes.INVOICE_GENERATION_REQUESTED,
    ]);
  });
});
