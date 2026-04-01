import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError } from '@/lib/utils/errors';
import { makeRequestLike } from '../helpers/auth';
import { getServiceContainer } from '@/lib/service-container';
import { Decimal } from '@prisma/client/runtime/library';

describe('Payment duplicate protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects duplicate payment reference with 409', async () => {
    const route = await import('@/app/api/payments/route');

    vi.spyOn(getServiceContainer().paymentService, 'createPayment')
      .mockResolvedValueOnce({
        payment: { id: 'pay-1', amount: new Decimal(1000), paidAt: new Date(), description: 'test', reference: 'REF-1', sourceFile: 'test', status: 'CONFIRMED' as const, matchedInvoiceId: 'inv-1', createdAt: new Date(), updatedAt: new Date() },
        invoice: { id: 'inv-1', status: 'PAID' as const, totalAmount: new Decimal(1000), paidAt: new Date() },
        settled: true,
        amount: 1000,
      } as any)
      .mockRejectedValueOnce(new ConflictError('Duplicate payment reference'));

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
