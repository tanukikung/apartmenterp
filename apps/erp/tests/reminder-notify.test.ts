import { describe, it, expect, vi } from 'vitest';
import { getEventBus, EventTypes, prisma, sendLineMessage } from '@/lib';

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

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    sendLineMessage: vi.fn(),
    prisma: {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'inv-1',
          roomNo: '101',
          dueDate: new Date('2026-03-05T00:00:00Z'),
          room: {
            roomNo: '101',
            tenants: [
              { tenant: { lineUserId: 'U777' } },
            ],
          },
        }),
      },
    },
  };
});

describe('Reminder notification via outbox', () => {
  it('sends LINE message for due soon', async () => {
    await import('@/modules/messaging/reminder-notifier');
    const bus = getEventBus();
    await bus.publish(
      EventTypes.INVOICE_REMINDER_DUE_SOON,
      'Invoice',
      'inv-1',
      { invoiceId: 'inv-1' } as unknown as Record<string, unknown>
    );
    expect(sendLineMessage).toHaveBeenCalledWith('U777', expect.stringContaining('Reminder: Invoice for Room 101 is due on 2026-03-05.'));
  });
});
