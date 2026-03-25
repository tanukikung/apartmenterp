import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentService } from '@/modules/payments/payment.service';

vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/line', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
  },
  logAudit: vi.fn(async () => {}),
}));

vi.mock('@/lib', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    prisma: mocks.prisma,
  };
});

vi.mock('@/modules/audit', () => ({
  logAudit: mocks.logAudit,
}));

describe('PaymentService.settleOutstandingBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a real payment only for the remaining outstanding balance', async () => {
    const paidAt = new Date('2026-03-17T02:00:00Z');
    const tx = {
      invoice: {
        findUnique: vi
          .fn()
          // First call: settleOutstandingBalance fetches invoice with totalAmount
          .mockResolvedValueOnce({
            id: 'inv-1',
            status: 'GENERATED',
            totalAmount: 1000,
            room: { roomNo: 'room-1' },
          })
          // Second call: syncInvoicePaymentState fetches with select
          .mockResolvedValueOnce({
            id: 'inv-1',
            status: 'GENERATED',
            totalAmount: 1000,
            paidAt: null,
          }),
        update: vi.fn(async () => ({
          id: 'inv-1',
          status: 'PAID',
          totalAmount: 1000,
          paidAt,
        })),
      },
      payment: {
        aggregate: vi
          .fn()
          // First call: get existing paid amount (400 already paid)
          .mockResolvedValueOnce({
            _sum: { amount: 400 },
          })
          // Second call: syncInvoicePaymentState aggregate
          .mockResolvedValueOnce({
            _sum: { amount: 1000 },
            _max: { paidAt },
          }),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => ({
          id: data.id,
          amount: data.amount,
          matchedInvoiceId: data.matchedInvoiceId,
        })),
      },
      outboxEvent: {
        create: vi.fn(async () => undefined),
      },
    } as any;

    mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    const service = new PaymentService();
    const result = await service.settleOutstandingBalance(
      'inv-1',
      {
        paidAt: '2026-03-17T02:00:00.000Z',
        referenceNumber: 'manual-ref-1',
      },
      'admin-1',
    );

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 600,
        description: 'MANUAL_INVOICE_SETTLEMENT',
        reference: 'manual-ref-1',
        matchedInvoiceId: 'inv-1',
        confirmedBy: 'admin-1',
      }),
    });
    expect(tx.invoice.update).toHaveBeenCalledTimes(1);
    expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(result.settled).toBe(true);
    expect(result.invoice.status).toBe('PAID');
  });

  it('rejects already-settled invoices without creating a payment', async () => {
    const tx = {
      invoice: {
        findUnique: vi.fn(async () => ({
          id: 'inv-1',
          status: 'GENERATED',
          totalAmount: 1000,
          room: { roomNo: 'room-1' },
        })),
      },
      payment: {
        aggregate: vi.fn(async () => ({
          _sum: { amount: 1000 },
        })),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    } as any;

    mocks.prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    const service = new PaymentService();
    await expect(
      service.settleOutstandingBalance('inv-1', undefined, 'admin-1'),
    ).rejects.toThrow(/already settled/i);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
