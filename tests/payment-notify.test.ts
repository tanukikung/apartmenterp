import { describe, it, expect, vi } from 'vitest';
import { getEventBus, EventTypes } from '@/lib';

vi.mock('@/lib/line/client', () => ({
  getLineClient: vi.fn(),
  getLineConfig: vi.fn(() => ({ channelId: '', channelSecret: '', accessToken: '' })),
  sendLineMessage: vi.fn().mockResolvedValue({}),
  sendLineImageMessage: vi.fn().mockResolvedValue({}),
  sendLineFileMessage: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendReceiptMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
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
  sendReceiptMessage: vi.fn().mockResolvedValue({}),
  sendOverdueNotice: vi.fn().mockResolvedValue({}),
  sendWelcomeMessage: vi.fn().mockResolvedValue({}),
  sendTemplateMessage: vi.fn().mockResolvedValue({}),
  sendReplyMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock('@/modules/messaging', () => ({
  sendReceiptMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    sendLineMessage: vi.fn().mockResolvedValue({}),
    prisma: {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv-1',
          roomNo: '101',
          totalAmount: 1234.5,
          paidAt: new Date('2026-03-10T00:00:00Z'),
          room: {
            roomNo: '101',
            tenants: [
              { tenant: { lineUserId: 'U999' } },
            ],
          },
        }),
      },
    },
  };
});

describe('Payment notification via outbox', () => {
  it('subscribes to INVOICE_PAID and sends LINE confirmation', async () => {
    const { sendReceiptMessage } = await import('@/modules/messaging');
    await import('@/modules/messaging/payment-notifier');
    const bus = getEventBus();
    await bus.publish(
      EventTypes.INVOICE_PAID,
      'Invoice',
      'inv-1',
      { invoiceId: 'inv-1' } as unknown as Record<string, unknown>
    );
    expect(sendReceiptMessage).toHaveBeenCalled();
    const args = (sendReceiptMessage as any).mock.calls[0];
    expect(args[0]).toBe('U999');
    expect(args[1]).toMatchObject({
      roomNumber: '101',
      amount: expect.stringContaining('1,234'),
    });
  });
});
