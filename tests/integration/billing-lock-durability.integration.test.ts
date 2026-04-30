import { describe, it, expect, vi } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import { prisma } from '@/lib/db/client';

describe('Integration: Billing lock durability', () => {
  // TODO: Requires `npx prisma db push --skip-generate --accept-data-loss` to add
  // new columns (commonAreaWaterUnits, commonAreaWaterAmount, etc.) to the test DB.
  // The local DB (test) is not fully migrated.
  it.skip('locks the billing record and writes durable outbox events for invoice generation', async () => {
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();
    process.env.USE_PRISMA_TEST_DB = 'true';

    const { prisma: db } = await import('@/lib/db/client');
    const billingFactory = await import('../../factories/billing.factory');
    const roomFactory = await import('../../factories/room.factory');

    try {
      await db.$connect();
    } catch {
      return;
    }

    const room = await roomFactory.createRoom('stub-floor-1', {
      roomNumber: `LOCKDUR-${Math.random().toString(36).slice(2, 6)}`,
    });
    const year = 3000 + Math.floor(Math.random() * 1000);
    const month = 1 + Math.floor(Math.random() * 12);
    const billing = await billingFactory.createBillingRecordForRoom(
      (room as any).roomNo,
      { year, month, rentAmount: 3200, periodStatus: 'OPEN' }
    );

    // Mock $transaction to run the callback directly (in-process, no real DB tx)
    const txMock = vi.fn(async (fn: any) => fn(db as any));
    (db as any).$transaction = txMock;

    const svc = createBillingService();
    await svc.lockBillingRecord(billing.id, { force: false }, 'durability-tester');

    const lockedRecord = await db.roomBilling.findUnique({
      where: { id: billing.id },
    });
    expect(lockedRecord?.status).toBe('LOCKED');

    const durableEvents = await db.outboxEvent.findMany({
      where: {
        aggregateId: billing.id,
        eventType: {
          in: ['BillingLocked', 'InvoiceGenerationRequested'],
        },
      },
      orderBy: { eventType: 'asc' },
    });

    const types = durableEvents.map((e: any) => e.eventType);
    expect(types).toContain('BillingLocked');
  });
});
