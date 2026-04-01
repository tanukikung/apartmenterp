import { describe, it, expect, vi } from 'vitest';
import { getEventBus, EventTypes } from '@/lib';

// Mock LINE client first
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
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

// Mock @/lib/line
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
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  getLineUserProfile: vi.fn().mockResolvedValue({}),
  verifyLineSignature: vi.fn().mockReturnValue(true),
  parseWebhookEvent: vi.fn(),
  isLineConfigured: vi.fn().mockReturnValue(false),
}));

// Mock @/modules/messaging to intercept sendInvoiceMessage calls from the notifier
vi.mock('@/modules/messaging', () => ({
  sendInvoiceMessage: vi.fn().mockResolvedValue({}),
  sendReminderMessage: vi.fn().mockResolvedValue({}),
  sendReceiptMessage: vi.fn().mockResolvedValue({}),
  sendTextWithQuickReply: vi.fn().mockResolvedValue({}),
  sendFlexMessage: vi.fn().mockResolvedValue({}),
}));

// Mock @/lib prisma
vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    prisma: {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv-1',
          roomNo: '101',
          year: 2026,
          month: 3,
          totalAmount: 1234.5,
          dueDate: new Date('2026-03-05T00:00:00Z'),
          room: {
            roomNo: '101',
            tenants: [
              { tenant: { lineUserId: 'U123' } },
            ],
          },
        }),
      },
    },
  };
});

describe('Invoice notification via outbox', () => {
  it('subscribes to INVOICE_GENERATED and sends LINE message', async () => {
    // Import the spy from the @/modules/messaging mock
    const { sendInvoiceMessage } = await import('@/modules/messaging');

    await import('@/modules/messaging/invoice-notifier');
    const bus = getEventBus();
    await bus.publish(
      EventTypes.INVOICE_GENERATED,
      'Invoice',
      'inv-1',
      { invoiceId: 'inv-1' } as unknown as Record<string, unknown>
    );
    expect(sendInvoiceMessage).toHaveBeenCalled();
    const args = (sendInvoiceMessage as any).mock.calls[0];
    expect(args[0]).toBe('U123');
    // amount is formatted as Thai currency: ฿1,234.50
    expect(args[1]).toMatchObject({
      roomNumber: '101',
      amount: expect.stringContaining('1,234'),
      invoiceNumber: 'INV-1',
    });
  });
});
