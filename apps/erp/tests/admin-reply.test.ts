import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma, sendLineMessage } from '@/lib';
import { makeRequestLike } from './helpers/auth';

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
      conversation: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      message: {
        create: vi.fn().mockResolvedValue({ id: 'm-1' }),
      },
      auditLog: {
        create: vi.fn(),
      },
    },
  };
});

describe('Admin reply messaging API', () => {
  beforeEach(() => {
    (prisma.conversation.findUnique as any).mockReset();
    (prisma.conversation.update as any).mockReset();
    (prisma.message.create as any).mockClear();
    (sendLineMessage as any).mockClear();
  });

  it('creates outgoing message and sends via LINE', async () => {
    (prisma.conversation.findUnique as any).mockResolvedValue({
      id: 'c-1',
      lineUserId: 'U123',
    });
    const mod = await import('@/app/api/conversations/[id]/messages/route');
    const reqBody = { text: 'Your invoice has been updated.' };
    const req = makeRequestLike({
      url: 'http://localhost/api/conversations/c-1/messages',
      method: 'POST',
      role: 'ADMIN',
      body: reqBody,
    });
    const res: Response = await (mod as any).POST(req, { params: { id: 'c-1' } });
    expect(res.ok).toBe(true);
    expect(sendLineMessage).toHaveBeenCalledWith('U123', 'Your invoice has been updated.');
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const call = (prisma.message.create as any).mock.calls[0][0];
    expect(call.data.direction).toBe('OUTGOING');
    expect(call.data.type).toBe('TEXT');
    expect(call.data.metadata).toMatchObject({ status: 'SENT' });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: expect.objectContaining({ lastMessageAt: expect.any(Date) }),
    });
  });

  it('stores FAILED status and returns error when LINE send fails', async () => {
    (prisma.conversation.findUnique as any).mockResolvedValue({
      id: 'c-2',
      lineUserId: 'U999',
    });
    (sendLineMessage as any).mockRejectedValueOnce(new Error('LINE error'));
    const mod = await import('@/app/api/conversations/[id]/messages/route');
    const reqBody = { text: 'Test failure path.' };
    const req = makeRequestLike({
      url: 'http://localhost/api/conversations/c-2/messages',
      method: 'POST',
      role: 'ADMIN',
      body: reqBody,
    });
    const res: Response = await (mod as any).POST(req, { params: { id: 'c-2' } });
    expect(res.ok).toBe(false);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const call = (prisma.message.create as any).mock.calls[0][0];
    expect(call.data.metadata).toMatchObject({ status: 'FAILED' });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c-2' },
      data: expect.objectContaining({ lastMessageAt: expect.any(Date) }),
    });
  });
});
