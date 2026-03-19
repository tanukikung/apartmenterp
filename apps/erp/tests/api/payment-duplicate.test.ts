import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError } from '@/lib/utils/errors';
import { makeRequestLike } from '../helpers/auth';

describe('Payment duplicate protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects duplicate payment reference with 409', async () => {
    const serviceModule = await import('@/modules/payments/payment.service');
    const route = await import('@/app/api/payments/route');

    vi.spyOn(serviceModule, 'getPaymentService').mockReturnValue({
      createPayment: vi
        .fn()
        .mockResolvedValueOnce({
          payment: { id: 'pay-1' },
          invoice: { id: 'inv-1', status: 'PAID' },
          settled: true,
        })
        .mockRejectedValueOnce(new ConflictError('Duplicate payment reference')),
    } as any);

    const payload = {
      invoiceId: '11111111-1111-1111-1111-111111111111',
      amount: 1000,
      method: 'CASH',
      referenceNumber: 'REF-1',
    };

    const r1 = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/payments',
        method: 'POST',
        role: 'ADMIN',
        body: payload,
      }) as any,
    );
    const r2 = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/payments',
        method: 'POST',
        role: 'ADMIN',
        body: payload,
      }) as any,
    );

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(409);
  });
});
