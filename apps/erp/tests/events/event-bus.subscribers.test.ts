import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getEventBus, EventTypes } from '@/lib';

describe('EventBus subscribers', () => {
  beforeEach(() => {
    const bus = getEventBus();
    bus.clearHistory();
    vi.restoreAllMocks();
  });

  it('handles InvoiceGenerated event', async () => {
    const bus = getEventBus();
    const handler = vi.fn(async () => {});
    bus.subscribe(EventTypes.INVOICE_GENERATED, handler);

    const evt = await bus.publish<any>(
      EventTypes.INVOICE_GENERATED,
      'Invoice',
      '00000000-0000-0000-0000-00000000aaaa',
      {
        invoiceId: '00000000-0000-0000-0000-00000000aaaa',
        roomId: '00000000-0000-0000-0000-00000000bbbb',
        roomNumber: '101',
        billingRecordId: '00000000-0000-0000-0000-00000000cccc',
        year: 2026,
        month: 3,
        version: 1,
        subtotal: 1000,
        total: 1000,
        dueDate: new Date().toISOString(),
      } as any
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(evt.type).toBe(EventTypes.INVOICE_GENERATED);
    expect(evt.aggregateId).toBe('00000000-0000-0000-0000-00000000aaaa');
  });

  it('handles InvoicePaid event', async () => {
    const bus = getEventBus();
    const handler = vi.fn(async () => {});
    bus.subscribe(EventTypes.INVOICE_PAID, handler);

    const evt = await bus.publish<any>(
      EventTypes.INVOICE_PAID,
      'Invoice',
      '00000000-0000-0000-0000-00000000dddd',
      {
        invoiceId: '00000000-0000-0000-0000-00000000dddd',
        paymentId: '00000000-0000-0000-0000-00000000eeee',
        paidAt: new Date().toISOString(),
        amount: 1000,
      } as any
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(evt.type).toBe(EventTypes.INVOICE_PAID);
    expect(evt.aggregateId).toBe('00000000-0000-0000-0000-00000000dddd');
  });

  it('handles BillingLocked event', async () => {
    const bus = getEventBus();
    const handler = vi.fn(async () => {});
    bus.subscribe(EventTypes.BILLING_LOCKED, handler);

    const evt = await bus.publish<any>(
      EventTypes.BILLING_LOCKED,
      'BillingRecord',
      '00000000-0000-0000-0000-000000000001',
      {
        billingRecordId: '00000000-0000-0000-0000-000000000001',
        roomId: '00000000-0000-0000-0000-000000000002',
        roomNumber: '101',
        year: 2026,
        month: 3,
        totalAmount: 1000,
        lockedBy: 'admin',
      } as any
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(evt.type).toBe(EventTypes.BILLING_LOCKED);
    expect(evt.aggregateId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('handles PaymentConfirmed event', async () => {
    const bus = getEventBus();
    const handler = vi.fn(async () => {});
    bus.subscribe(EventTypes.PAYMENT_CONFIRMED, handler);

    const evt = await bus.publish<any>(
      EventTypes.PAYMENT_CONFIRMED,
      'Payment',
      '00000000-0000-0000-0000-000000000010',
      {
        paymentId: '00000000-0000-0000-0000-000000000010',
        invoiceId: '00000000-0000-0000-0000-000000000011',
        confirmedBy: 'admin',
        confirmedAt: new Date().toISOString(),
      } as any
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(evt.type).toBe(EventTypes.PAYMENT_CONFIRMED);
    expect(evt.aggregateId).toBe('00000000-0000-0000-0000-000000000010');
  });
});
