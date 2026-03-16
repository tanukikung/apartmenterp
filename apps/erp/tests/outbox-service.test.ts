import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/outbox', async () => {
  const actual = await vi.importActual<any>('@/lib/outbox');
  return {
    ...actual,
    publishEvent: vi.fn(),
    getOutboxProcessor: actual.getOutboxProcessor,
  };
});

describe('Outbox publishEvent helper', () => {
  it('forwards to lib publishEvent with same args', async () => {
    const { publishEvent: infraPublish } = await import('@/infrastructure/outbox/outbox.service');
    const { publishEvent: libPublish } = await import('@/lib/outbox');
    await infraPublish('InvoicePaid', { invoiceId: '11111111-1111-1111-1111-111111111111', amount: 1000 });
    expect(libPublish).toHaveBeenCalledWith('InvoicePaid', {
      invoiceId: '11111111-1111-1111-1111-111111111111',
      amount: 1000,
    });
  });
});

