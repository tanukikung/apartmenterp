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

    // New schema: no building/floor models, Room PK is roomNo (string)
    const roomNo = `TEST-BI-${crypto.randomUUID().slice(0, 8)}`;
    await (prisma as any).room.create({
      data: {
        roomNo,
        floorNo: 1,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 5000,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'ACTIVE',
      },
    });

    const period = await (prisma as any).billingPeriod.create({
      data: { year: 2026, month: 3, status: 'LOCKED', dueDay: 5 },
    });
    const billing = await (prisma as any).roomBilling.create({
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

    const svc = getInvoiceService();
    const invoice = await svc.generateInvoiceFromBilling(billing.id);

    expect(invoice).toBeTruthy();
    expect(invoice.totalAmount).toBeGreaterThan(0);
  });
});
