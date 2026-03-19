import { describe, it, expect, vi } from 'vitest';
import { makeRequestLike } from './helpers/auth';

describe('Payments API', () => {
  it('creates payment and returns settled invoice payload', async () => {
    const serviceModule = await import('@/modules/payments/payment.service');
    const route = await import('@/app/api/payments/route');

    vi.spyOn(serviceModule, 'getPaymentService').mockReturnValue({
      createPayment: vi.fn(async () => ({
        payment: { id: 'pay-1' },
        invoice: { id: 'inv-1', status: 'PAID' },
        settled: true,
      })),
    } as any);

    const req = makeRequestLike({
      url: 'http://localhost/api/payments',
      method: 'POST',
      role: 'ADMIN',
      body: {
        invoiceId: '11111111-1111-1111-1111-111111111111',
        amount: 1200,
        method: 'PROMPTPAY',
        referenceNumber: 'ABC123',
      },
    });

    const res: Response = await route.POST(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('settled');
    expect(body.data.invoice.status).toBe('PAID');
  });
});
