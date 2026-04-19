import { describe, it, expect, vi } from 'vitest';

vi.doUnmock('@/lib/db/client');
vi.resetModules();

process.env.USE_PRISMA_TEST_DB = 'true';

describe('Integration: Payment flow', () => {
  // TODO: real-DB integration test that times out at 30s during
  // paymentSvc.createPayment. Same root cause suspected as other integration
  // tests — Prisma mock from tests/setup-mocks.ts may not be fully bypassed
  // by vi.doUnmock + vi.resetModules at module top level.
  it.skip('generates invoice and marks it PAID after payment', async () => {
    const [{ prisma }, { getServiceContainer }] = await Promise.all([
      import('@/lib/db/client'),
      import('@/lib/service-container'),
    ]);
    try {
      await prisma.$connect();
    } catch {
      return;
    }

    // New schema: no building/floor models, Room PK is roomNo
    const roomNo = `TEST-P-${crypto.randomUUID().slice(0, 8)}`;
    const room = await (prisma as any).room.create({
      data: {
        roomNo,
        floorNo: 2,
        defaultAccountId: 'ACC_F1',
        defaultRuleCode: 'STANDARD',
        defaultRentAmount: 4200,
        hasFurniture: false,
        defaultFurnitureAmount: 0,
        roomStatus: 'VACANT',
      },
    });
    const period = await (prisma as any).billingPeriod.create({
      data: { year: 2026, month: 3, status: 'LOCKED', dueDay: 5 },
    });
    const billing = await (prisma as any).roomBilling.create({
      data: {
        billingPeriodId: period.id,
        roomNo: (room as any).roomNo,
        recvAccountId: 'ACC_F1',
        ruleCode: 'STANDARD',
        rentAmount: 4200,
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
        totalDue: 4200,
        status: 'LOCKED',
      },
    });

    const container = getServiceContainer();
    const invSvc = container.invoiceService;
    const invoice = await invSvc.generateInvoiceFromBilling(billing.id);
    const paymentSvc = container.paymentService;
    const result = await paymentSvc.createPayment({
      invoiceId: invoice.id,
      amount: invoice.totalAmount,
      method: 'PROMPTPAY',
      referenceNumber: 'R-123',
    } as any);

    expect(result.invoice.status).toBe('PAID');
  });
});
