import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeRequestLike } from '../helpers/auth';

describe('Payment API routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('successful payment match: POST /api/payments creates payment and sets invoice PAID', async () => {
    const mod = await import('@/modules/payments/payment.service');
    const route = await import('@/app/api/payments/route');
    const payments: Array<{ id: string }> = [];
    let invoiceStatus = 'GENERATED';

    vi.spyOn(mod, 'getPaymentService').mockReturnValue({
      createPayment: vi.fn(async () => {
        const payment = { id: 'pay-123' } as any;
        const invoice = { id: 'inv-123', status: 'PAID' } as any;
        payments.push(payment);
        invoiceStatus = 'PAID';
        return { payment, invoice, settled: true };
      }),
    } as any);

    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/payments',
        method: 'POST',
        role: 'ADMIN',
        body: {
          invoiceId: '11111111-1111-1111-1111-111111111111',
          amount: 1000,
          method: 'CASH',
        },
      }) as any,
    );

    expect(res.status).toBe(201);
    expect(payments.length).toBe(1);
    expect(invoiceStatus).toBe('PAID');
    expect((await res.json())?.success).toBe(true);
  });

  it('confirm payment: POST /api/payments/match/confirm updates invoice to PAID and creates payment', async () => {
    const mod = await import('@/modules/payments/payment-matching.service');
    const route = await import('@/app/api/payments/match/confirm/route');
    const payments: string[] = [];
    const invoice = { id: 'inv-789', status: 'GENERATED' };

    vi.spyOn(mod, 'getPaymentMatchingService').mockReturnValue({
      confirmMatch: vi.fn(async () => {
        payments.push('pay-999');
        invoice.status = 'PAID';
      }),
    } as any);

    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/payments/match/confirm',
        method: 'POST',
        role: 'STAFF',
        body: {
          transactionId: 'txn-1',
          invoiceId: 'inv-789',
        },
      }) as any,
    );

    expect(res.status).toBe(200);
    expect(payments.length).toBe(1);
    expect(invoice.status).toBe('PAID');
    expect((await res.json())?.success).toBe(true);
  });

  it('reject payment: POST /api/payments/match/reject leaves invoice unchanged', async () => {
    const mod = await import('@/modules/payments/payment-matching.service');
    const route = await import('@/app/api/payments/match/reject/route');
    const invoice = { id: 'inv-456', status: 'GENERATED' };

    vi.spyOn(mod, 'getPaymentMatchingService').mockReturnValue({
      rejectMatch: vi.fn(async () => {
        invoice.status = 'GENERATED';
      }),
    } as any);

    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/payments/match/reject',
        method: 'POST',
        role: 'ADMIN',
        body: {
          transactionId: 'txn-2',
          rejectReason: 'Invalid',
        },
      }) as any,
    );

    expect(res.status).toBe(200);
    expect(invoice.status).toBe('GENERATED');
    expect((await res.json())?.success).toBe(true);
  });

  it('unauthenticated returns 401 and invalid role returns 403', async () => {
    const confirmRoute = await import('@/app/api/payments/match/confirm/route');
    const rejectRoute = await import('@/app/api/payments/match/reject/route');

    const res2 = await confirmRoute.POST(
      makeRequestLike({
        url: 'http://localhost/api/payments/match/confirm',
        method: 'POST',
        body: { transactionId: 't', invoiceId: 'i' },
      }) as any,
    );
    expect(res2.status).toBe(401);

    const res3 = await rejectRoute.POST(
      makeRequestLike({
        url: 'http://localhost/api/payments/match/reject',
        method: 'POST',
        role: 'TENANT' as any,
        body: { transactionId: 't', rejectReason: 'x' },
      }) as any,
    );
    expect(res3.status).toBe(403);
  });
});
