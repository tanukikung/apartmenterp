import { describe, it, expect, vi } from 'vitest';
import { makeRequestLike } from './helpers/auth';
import { getServiceContainer } from '@/lib/service-container';
import { Decimal } from '@prisma/client/runtime/library';

describe('Payments API', () => {
  it('creates payment and returns settled invoice payload', async () => {
    const route = await import('@/app/api/payments/route');

    vi.spyOn(getServiceContainer().paymentService, 'createPayment').mockResolvedValue({
      payment: { id: 'pay-1', amount: new Decimal(1200), paidAt: new Date(), description: 'test', reference: 'ABC123', sourceFile: 'test', status: 'CONFIRMED' as const, matchedInvoiceId: 'inv-1', createdAt: new Date(), updatedAt: new Date() },
      invoice: { id: 'inv-1', status: 'PAID' as const, totalAmount: new Decimal(1200), paidAt: new Date() },
      settled: true,
      amount: 1200,
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
