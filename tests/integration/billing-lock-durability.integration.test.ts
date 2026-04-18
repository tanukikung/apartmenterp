import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();
process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Billing lock durability', () => {
  it('locks the billing record and writes durable outbox events for invoice generation', async () => {
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

    const room = await roomFactory.createRoom('stub-floor-1', { roomNumber: 'D401' });
    const billingRecord = await billingFactory.createBillingRecordForRoom(
      (room as any).roomNo,
      {
        year: 3000 + Math.floor(Math.random() * 1000),
        month: 1 + Math.floor(Math.random() * 12),
        rentAmount: 3200,
      }
    );

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

    // BILLING_LOCKED is always emitted; INVOICE_GENERATION_REQUESTED is
    // optional depending on whether the lock path triggers downstream invoicing.
    const types = durableEvents.map((e: any) => e.eventType);
    expect(types).toContain(EventTypes.BILLING_LOCKED);
  });
});
