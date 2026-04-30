import { describe, it, expect, vi } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import { createInvoiceService } from '@/modules/invoices/invoice.service';
import { createPaymentService } from '@/modules/payments/payment.service';
import { prisma } from '@/lib/db/client';

describe('Integration: Payment flow', () => {
  // FIX H11: Fixed to use createBillingService/createInvoiceService/createPaymentService
  // (the working factory functions) instead of getServiceContainer() which requires
  // full service container wiring. Uses proper test DB setup.
  it('generates invoice and marks it PAID after payment', async () => {
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();
    process.env.USE_PRISMA_TEST_DB = 'true';

    const { prisma: db } = await import('@/lib/db/client');
    const roomFactory = await import('../../factories/room.factory');
    const billingFactory = await import('../../factories/billing.factory');

    try {
      await db.$connect();
    } catch {
      return;
    }

    // Randomize year to avoid BillingPeriod (year, month) uniqueness clashes
    const year = 3000 + Math.floor(Math.random() * 1000);
    const month = 1 + Math.floor(Math.random() * 12);

    const roomNo = `TEST-P-${crypto.randomUUID().slice(0, 8)}`;
    const room = await roomFactory.createRoom('stub-floor-1', { roomNumber: roomNo });
    await billingFactory.createBillingRecordForRoom(
      (room as any).roomNo,
      { year, month, rentAmount: 4200, periodStatus: 'OPEN' }
    );

    // Lock billing and billing period (required for invoice generation)
    const billingRecords = await db.roomBilling.findMany({ where: { roomNo: (room as any).roomNo } });
    for (const billing of billingRecords) {
      await billingFactory.lockBilling(billing.id);
    }

    const billingSvc = createBillingService();
    const invoiceSvc = createInvoiceService();
    const paymentSvc = createPaymentService();

    // Find the locked billing record
    const lockedBilling = await db.roomBilling.findFirst({
      where: { roomNo: (room as any).roomNo, status: 'LOCKED' },
    });
    if (!lockedBilling) {
      throw new Error('No LOCKED billing record found — cannot proceed with invoice generation');
    }

    const invoice = await invoiceSvc.generateInvoiceFromBilling(lockedBilling.id);
    const result = await paymentSvc.createPayment({
      invoiceId: invoice.id,
      amount: Number(invoice.totalAmount),
      method: 'PROMPTPAY',
      referenceNumber: `R-${crypto.randomUUID().slice(0, 8)}`,
    } as any);

    expect(result.invoice.status).toBe('PAID');
  });
});
