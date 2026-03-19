import { describe, it, expect, vi } from 'vitest';
import { syncInvoicePaymentState } from '@/modules/payments/invoice-payment-state';

describe('Payment integrity semantics', () => {
  it('keeps invoices unpaid for partial payments', async () => {
    const tx = {
      invoice: {
        findUnique: vi.fn(async () => ({
          id: 'inv-1',
          status: 'GENERATED',
          totalAmount: 1000,
          paidAt: null,
        })),
        update: vi.fn(),
      },
      payment: {
        aggregate: vi.fn(async () => ({
          _sum: { amount: 400 },
          _max: { paidAt: new Date('2026-03-17T01:00:00Z') },
        })),
      },
      outboxEvent: {
        create: vi.fn(),
      },
    } as any;

    const result = await syncInvoicePaymentState(tx, {
      invoiceId: 'inv-1',
      paymentId: 'pay-1',
      paymentAmount: 400,
      paidAt: new Date('2026-03-17T01:00:00Z'),
    });

    expect(result.settled).toBe(false);
    expect(result.invoice.status).toBe('GENERATED');
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('marks invoices paid for exact payments', async () => {
    const paidAt = new Date('2026-03-17T02:00:00Z');
    const tx = {
      invoice: {
        findUnique: vi.fn(async () => ({
          id: 'inv-1',
          status: 'GENERATED',
          totalAmount: 1000,
          paidAt: null,
        })),
        update: vi.fn(async () => ({
          id: 'inv-1',
          status: 'PAID',
          totalAmount: 1000,
          paidAt,
        })),
      },
      payment: {
        aggregate: vi.fn(async () => ({
          _sum: { amount: 1000 },
          _max: { paidAt },
        })),
      },
      outboxEvent: {
        create: vi.fn(async () => undefined),
      },
    } as any;

    const result = await syncInvoicePaymentState(tx, {
      invoiceId: 'inv-1',
      paymentId: 'pay-1',
      paymentAmount: 1000,
      paidAt,
    });

    expect(result.settled).toBe(true);
    expect(result.totalPaid).toBe(1000);
    expect(result.invoice.status).toBe('PAID');
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'PAID', paidAt },
      select: { id: true, status: true, totalAmount: true, paidAt: true },
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('marks invoices paid for overpayments without losing the aggregate amount', async () => {
    const paidAt = new Date('2026-03-17T03:00:00Z');
    const tx = {
      invoice: {
        findUnique: vi.fn(async () => ({
          id: 'inv-1',
          status: 'GENERATED',
          totalAmount: 1000,
          paidAt: null,
        })),
        update: vi.fn(async () => ({
          id: 'inv-1',
          status: 'PAID',
          totalAmount: 1000,
          paidAt,
        })),
      },
      payment: {
        aggregate: vi.fn(async () => ({
          _sum: { amount: 1200 },
          _max: { paidAt },
        })),
      },
      outboxEvent: {
        create: vi.fn(async () => undefined),
      },
    } as any;

    const result = await syncInvoicePaymentState(tx, {
      invoiceId: 'inv-1',
      paymentId: 'pay-2',
      paymentAmount: 1200,
      paidAt,
    });

    expect(result.settled).toBe(true);
    expect(result.totalPaid).toBe(1200);
    expect(result.invoice.status).toBe('PAID');
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('transitions to PAID only after multiple confirmed payments settle the total', async () => {
    const invoiceFindUnique = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'inv-1',
        status: 'GENERATED',
        totalAmount: 1000,
        paidAt: null,
      })
      .mockResolvedValueOnce({
        id: 'inv-1',
        status: 'GENERATED',
        totalAmount: 1000,
        paidAt: null,
      });
    const invoiceUpdate = vi.fn(async () => ({
      id: 'inv-1',
      status: 'PAID',
      totalAmount: 1000,
      paidAt: new Date('2026-03-17T05:00:00Z'),
    }));
    const paymentAggregate = vi
      .fn()
      .mockResolvedValueOnce({
        _sum: { amount: 400 },
        _max: { paidAt: new Date('2026-03-17T04:00:00Z') },
      })
      .mockResolvedValueOnce({
        _sum: { amount: 1000 },
        _max: { paidAt: new Date('2026-03-17T05:00:00Z') },
      });
    const outboxCreate = vi.fn(async () => undefined);

    const tx = {
      invoice: {
        findUnique: invoiceFindUnique,
        update: invoiceUpdate,
      },
      payment: {
        aggregate: paymentAggregate,
      },
      outboxEvent: {
        create: outboxCreate,
      },
    } as any;

    const first = await syncInvoicePaymentState(tx, {
      invoiceId: 'inv-1',
      paymentId: 'pay-1',
      paymentAmount: 400,
      paidAt: new Date('2026-03-17T04:00:00Z'),
    });
    const second = await syncInvoicePaymentState(tx, {
      invoiceId: 'inv-1',
      paymentId: 'pay-2',
      paymentAmount: 600,
      paidAt: new Date('2026-03-17T05:00:00Z'),
    });

    expect(first.settled).toBe(false);
    expect(second.settled).toBe(true);
    expect(invoiceUpdate).toHaveBeenCalledTimes(1);
    expect(outboxCreate).toHaveBeenCalledTimes(1);
  });
});
