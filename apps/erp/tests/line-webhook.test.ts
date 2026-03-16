import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib';

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    verifyLineSignature: vi.fn(() => true),
    parseWebhookEvent: vi.fn((raw: any) => raw),
    prisma: {
      lineUser: {
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'lu-1', lineUserId: 'U123', displayName: 'Unknown' }),
      },
      conversation: {
        findUnique: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 'c-1', lineUserId: 'U123' }),
        update: vi.fn(),
      },
      message: {
        create: vi.fn(),
      },
    },
  };
});

describe('LINE Webhook', () => {
  beforeEach(() => {
    (prisma.lineUser.findUnique as any).mockReset();
    (prisma.conversation.findUnique as any).mockReset();
  });

  it('parses event and creates conversation/messages', async () => {
    (prisma.lineUser.findUnique as any).mockResolvedValue(null);
    (prisma.conversation.findUnique as any).mockResolvedValue(null);
    const mod = await import('@/app/api/line/webhook/route');
    const body = JSON.stringify({
      events: [
        {
          userId: 'U123',
          messageText: 'Hello',
          timestamp: Date.now(),
          messageId: 'M1',
        },
      ],
    });
    const req: any = {
      text: async () => body,
      headers: new Headers({ 'x-line-signature': 'sig' }),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    expect(prisma.lineUser.create).toHaveBeenCalled();
    expect(prisma.conversation.create).toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalled();
  });
});
