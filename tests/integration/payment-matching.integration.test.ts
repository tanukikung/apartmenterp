import { describe, it, expect, vi } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import { createPaymentMatchingService } from '@/modules/payments/payment-matching.service';
import { prisma } from '@/lib/db/client';

describe('Integration: Payment Matching', () => {
  // FIX H11: Fixed to use createBillingService (not getBillingService) and
  // createPaymentMatchingService (not getPaymentMatchingService). Also fixed
  // lockBilling to set BillingPeriod to LOCKED (required for invoice generation).
  it('confirms match and marks invoice PAID, emits outbox event', async () => {
    vi.doUnmock('@/lib/db/client');
    vi.resetModules();
    process.env.USE_PRISMA_TEST_DB = 'true';

    // Import fresh so the unmock takes effect
    const { prisma: db } = await import('@/lib/db/client');
    const billingFactory = await import('../factories/billing.factory');
    const invoiceFactory = await import('../factories/invoice.factory');
    const roomFactory = await import('../factories/room.factory');

    try {
      await db.$connect();
    } catch {
      // No test DB — skip
      return;
    }

    // Randomize year to sidestep (year, month) uniqueness across parallel forks
    const year = 3000 + Math.floor(Math.random() * 1000);
    const month = 1 + Math.floor(Math.random() * 12);

    const billingService = createBillingService();
    const matcherService = createPaymentMatchingService();

    const room = await roomFactory.createRoom('stub-floor-1', { roomNumber: `PMATCH-${Math.random().toString(36).slice(2, 6)}` });

    const billing = await billingFactory.createBillingRecordForRoom(
      (room as any).roomNo,
      { year, month, rentAmount: 5000, periodStatus: 'OPEN' }
    );
    await billingFactory.addOtherItem(billing.id, 3000, 'Extra');

    // Lock billing record (BillingPeriod must be LOCKED for invoice generation)
    await billingFactory.lockBilling(billing.id);

    const invoice = await invoiceFactory.createInvoiceFromBilling(billing.id);

    const txAmount = Number(invoice.totalAmount);
    const tx = await db.paymentTransaction.create({
      data: {
        amount: txAmount,
        transactionDate: new Date(),
        description: `Invoice ${invoice.id}`,
        reference: 'MATCH-OK',
        sourceFile: 'test',
        status: 'PENDING',
        confidenceScore: 0.9,
      } as any,
    });

    await matcherService.confirmMatch(tx.id, invoice.id, 'tester');

    const updated = await db.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe('PAID');

    const outbox = await db.outboxEvent.findFirst({
      where: { aggregateId: invoice.id, eventType: 'InvoicePaid' },
    });
    expect(outbox).toBeTruthy();
  });
});
