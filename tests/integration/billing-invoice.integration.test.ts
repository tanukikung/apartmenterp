import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import { createInvoiceService } from '@/modules/invoices/invoice.service';
import { prisma } from '@/lib/db/client';

describe('Integration: Billing → Invoice', () => {
  // TODO: Requires `npx prisma db push --skip-generate --accept-data-loss` to add
  // new columns (commonAreaWaterUnits, commonAreaWaterAmount, etc.) to the test DB.
  // The local DB (test) is not fully migrated.
  it.skip('creates locked billing and generates invoice', async () => {
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();
    process.env.USE_PRISMA_TEST_DB = 'true';

    const { prisma: db } = await import('@/lib/db/client');
    const billingFactory = await import('../../factories/billing.factory');
    const roomFactory = await import('../../factories/room.factory');

    beforeAll(async () => {
      try {
        await db.$connect();
      } catch {
        // No test DB available — skip this test
      }
    });

    try {
      await db.$connect();
    } catch {
      return;
    }

    const roomNo = `TEST-BI-${crypto.randomUUID().slice(0, 8)}`;
    await db.room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });

    // Randomize year/month to avoid unique constraint collisions
    const year = 3000 + Math.floor(Math.random() * 1000);
    const month = 1 + Math.floor(Math.random() * 12);
    const period = await db.billingPeriod.create({
      data: { year, month, status: 'LOCKED', dueDay: 5 },
    });
    const billing = await db.roomBilling.create({
      data: {
        billingPeriodId: period.id,
        roomNo,
        recvAccountId: 'ACC_F1',
        ruleCode: 'STANDARD',
        rentAmount: 5000,
        waterMode: 'NORMAL',
        waterUnits: 0,
        waterUsageCharge: 0,
        waterServiceFee: 0,
        waterTotal: 0,
        electricMode: 'NORMAL',
        electricUnits: 0,
        electricUsageCharge: 0,
        electricServiceFee: 0,
        electricTotal: 0,
        furnitureFee: 0,
        otherFee: 0,
        totalDue: 5000,
        status: 'LOCKED',
      },
    });

    const billingSvc = createBillingService();
    const invoiceSvc = createInvoiceService();
    const invoice = await invoiceSvc.generateInvoiceFromBilling(billing.id);

    expect(invoice).toBeTruthy();
    expect(invoice.totalAmount).toBeGreaterThan(0);
  });
});
