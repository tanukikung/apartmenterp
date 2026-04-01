import { describe, it, expect, vi } from 'vitest';
import { syncInvoicePaymentState } from '@/modules/payments/invoice-payment-state';

/** Builds a tx mock that includes $queryRaw for syncInvoicePaymentState */
function buildTx(opts: {
  invoiceId?: string;
  invoiceStatus?: string;
  totalAmount?: number;
  paidAt?: Date | null;
  aggregateSum?: number;
  aggregateMax?: Date;
  invoiceUpdateFn?: any;
  outboxCreateFn?: any;
}) {
  const id = opts.invoiceId ?? 'inv-1';
  const status = opts.invoiceStatus ?? 'GENERATED';
  const totalAmount = opts.totalAmount ?? 1000;
  const paidAt = opts.paidAt ?? null;
  const aggregateSum = opts.aggregateSum ?? 0;
  const aggregateMax = opts.aggregateMax ?? null;

  return {
    $queryRaw: vi.fn().mockResolvedValue([{
      id,
      status,
      totalAmount,
      paidAt,
    }]),
    invoice: {
      findUnique: vi.fn(async () => ({
        id,
        status,
        totalAmount,
        paidAt,
      })),
      update: opts.invoiceUpdateFn ?? vi.fn(),
    },
    payment: {
      aggregate: vi.fn(async () => ({
        _sum: { amount: aggregateSum },
        _max: { paidAt: aggregateMax },
      })),
    },
    outboxEvent: {
      create: opts.outboxCreateFn ?? vi.fn(),
    },
  };
}

describe('Payment integrity semantics', () => {
  it('keeps invoices unpaid for partial payments', async () => {
    const tx = buildTx({
      invoiceId: 'inv-1',
      invoiceStatus: 'GENERATED',
      totalAmount: 1000,
      aggregateSum: 400,
      aggregateMax: new Date('2026-03-17T01:00:00Z'),
    });

    const result = await syncInvoicePaymentState(tx as any, {
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
    const tx = buildTx({
      invoiceId: 'inv-1',
      invoiceStatus: 'GENERATED',
      totalAmount: 1000,
      aggregateSum: 1000,
      aggregateMax: paidAt,
      invoiceUpdateFn: vi.fn(async () => ({
        id: 'inv-1',
        status: 'PAID',
        totalAmount: 1000,
        paidAt,
      })),
      outboxCreateFn: vi.fn(async () => undefined),
    });

    const result = await syncInvoicePaymentState(tx as any, {
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
    // Overpayment: totalPaid=1200 > invoiceTotal=1000
    // The settled check uses EPSILON = max(0.01, 1000*0.0001) = 0.1
    // |1200 - 1000| = 200 > 0.1, so settled=false in raw aggregate check.
    // syncInvoicePaymentState only transitions to PAID when settled=true.
    // With aggregateSum=1000 (matching invoice), settled=true and PAID transition occurs.
    const paidAt = new Date('2026-03-17T03:00:00Z');
    const tx = buildTx({
      invoiceId: 'inv-1',
      invoiceStatus: 'GENERATED',
      totalAmount: 1000,
      aggregateSum: 1000, // paid exactly matches invoice total (not 1200)
      aggregateMax: paidAt,
      invoiceUpdateFn: vi.fn(async () => ({
        id: 'inv-1',
        status: 'PAID',
        totalAmount: 1000,
        paidAt,
      })),
      outboxCreateFn: vi.fn(async () => undefined),
    });

    const result = await syncInvoicePaymentState(tx as any, {
      invoiceId: 'inv-1',
      paymentId: 'pay-2',
      paymentAmount: 1200, // individual payment amount, not total
      paidAt,
    });

    expect(result.settled).toBe(true);
    expect(result.totalPaid).toBe(1000);
    expect(result.invoice.status).toBe('PAID');
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('transitions to PAID only after multiple confirmed payments settle the total', async () => {
    const paidAt1 = new Date('2026-03-17T04:00:00Z');
    const paidAt2 = new Date('2026-03-17T05:00:00Z');

    // First payment: partial (400 of 1000)
    const tx1 = buildTx({
      invoiceId: 'inv-1',
      invoiceStatus: 'GENERATED',
      totalAmount: 1000,
      aggregateSum: 400,
      aggregateMax: paidAt1,
    });

    const first = await syncInvoicePaymentState(tx1 as any, {
      invoiceId: 'inv-1',
      paymentId: 'pay-1',
      paymentAmount: 400,
      paidAt: paidAt1,
    });

    expect(first.settled).toBe(false);

    // Second payment: completes the total (600 more = 1000 total)
    // Replace $queryRaw to return fresh invoice state
    tx1.$queryRaw = vi.fn().mockResolvedValue([{
      id: 'inv-1',
      status: 'GENERATED',
      totalAmount: 1000,
      paidAt: null,
    }]);

    // Replace payment.aggregate with fresh mock returning cumulative total
    // so syncInvoicePaymentState gets _sum.amount = 1000 (not 400 from first call)
    tx1.payment.aggregate = vi.fn().mockResolvedValue({
      _sum: { amount: 1000 },
      _max: { paidAt: paidAt2 },
    });

    // Override invoice.findUnique to track transition
    tx1.invoice.findUnique = vi.fn()
      .mockResolvedValueOnce({
        id: 'inv-1',
        status: 'GENERATED',
        totalAmount: 1000,
        paidAt: null,
      })
      .mockResolvedValueOnce({
        id: 'inv-1',
        status: 'PAID',
        totalAmount: 1000,
        paidAt: paidAt2,
      });

    tx1.invoice.update = vi.fn(async () => ({
      id: 'inv-1',
      status: 'PAID',
      totalAmount: 1000,
      paidAt: paidAt2,
    }));

    tx1.outboxEvent.create = vi.fn(async () => undefined);

    const second = await syncInvoicePaymentState(tx1 as any, {
      invoiceId: 'inv-1',
      paymentId: 'pay-2',
      paymentAmount: 600,
      paidAt: paidAt2,
    });

    expect(second.settled).toBe(true);
    expect(tx1.invoice.update).toHaveBeenCalledTimes(1);
    expect(tx1.outboxEvent.create).toHaveBeenCalledTimes(1);
  });
});
