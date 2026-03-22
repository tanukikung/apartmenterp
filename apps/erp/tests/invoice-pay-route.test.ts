import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRequestLike } from './helpers/auth';

const settleOutstandingBalanceMock = vi.fn();

vi.mock('@/lib/service-container', () => ({
  getServiceContainer: () => ({
    paymentService: {
      settleOutstandingBalance: settleOutstandingBalanceMock,
    },
    eventBus: { publish: vi.fn(), subscribe: vi.fn() },
  }),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('POST /api/invoices/[id]/pay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settleOutstandingBalanceMock.mockResolvedValue({
      payment: { id: 'payment-1' },
      invoice: { id: 'invoice-1', status: 'PAID' },
      settled: true,
    });
  });

  it('records a canonical settlement payment instead of hard-setting PAID', async () => {
    const route = await import('@/app/api/invoices/[id]/pay/route');

    const res = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/invoices/invoice-1/pay',
        method: 'POST',
        role: 'ADMIN',
        sessionOverrides: { sub: 'verified-admin' },
        body: {
          paidAt: '2026-03-17',
          paymentId: '11111111-1111-1111-1111-111111111111',
        },
      }) as any,
      { params: { id: 'invoice-1' } } as any,
    );

    expect(res.status).toBe(200);
    expect(settleOutstandingBalanceMock).toHaveBeenCalledWith(
      'invoice-1',
      {
        paidAt: '2026-03-17',
        referenceNumber: '11111111-1111-1111-1111-111111111111',
      },
      'verified-admin',
    );

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ id: 'invoice-1', status: 'PAID' });
  });
});
