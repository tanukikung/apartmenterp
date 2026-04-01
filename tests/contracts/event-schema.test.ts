import { describe, it, expect } from 'vitest';
import { EventTypes, publishEvent } from '@/lib';

describe('Event payload validation (Zod)', () => {
  it('valid InvoicePaid payload passes', async () => {
    await publishEvent(
      EventTypes.INVOICE_PAID,
      { invoiceId: '11111111-1111-1111-1111-111111111111', paymentId: '22222222-2222-2222-2222-222222222222', paidAt: new Date().toISOString(), amount: 1000 }
    );
  });

  it('missing required fields throws error', async () => {
    await expect(publishEvent(
      EventTypes.INVOICE_PAID,
      { paymentId: '22222222-2222-2222-2222-222222222222', paidAt: new Date().toISOString(), amount: 1000 } as any
    )).rejects.toThrow(/Invalid payload/);
  });

  it('invalid types are rejected', async () => {
    await expect(publishEvent(
      EventTypes.BILLING_LOCKED,
      { billingRecordId: 'not-a-uuid', roomId: 'also-bad', roomNumber: '101', year: 2026, month: 3, totalAmount: 100 } as any
    )).rejects.toThrow(/Invalid payload/);
  });
});
