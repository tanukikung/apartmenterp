import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib';
import { makeRequestLike } from '../helpers/auth';

describe('Conversation API contract consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the same canonical message DTO in detail and paginated message endpoints', async () => {
    const detailRoute = await import('@/app/api/conversations/[id]/route');
    const messagesRoute = await import('@/app/api/conversations/[id]/messages/route');

    const message = {
      id: 'msg-1',
      lineMessageId: 'line-1',
      direction: 'OUTGOING',
      type: 'TEXT',
      content: 'Payment reminder sent',
      metadata: { status: 'FAILED', error: 'LINE unavailable' },
      isRead: false,
      readAt: null,
      sentAt: new Date('2026-03-17T03:00:00Z'),
    };

    (prisma.conversation.findUnique as any).mockResolvedValue({
      id: 'conv-1',
      lineUserId: 'U123',
      status: 'ACTIVE',
      createdAt: new Date('2026-03-17T01:00:00Z'),
      updatedAt: new Date('2026-03-17T02:00:00Z'),
      tenant: null,
      messages: [message],
    });
    (prisma.message.findMany as any).mockResolvedValue([message]);

    const detailRes = await detailRoute.GET(
      makeRequestLike({
        url: 'http://localhost/api/conversations/conv-1',
        method: 'GET',
        role: 'ADMIN',
      }) as any,
      { params: { id: 'conv-1' } } as any,
    );
    const messagesRes = await messagesRoute.GET(
      makeRequestLike({
        url: 'http://localhost/api/conversations/conv-1/messages?limit=10',
        method: 'GET',
        role: 'ADMIN',
      }) as any,
      { params: { id: 'conv-1' } } as any,
    );

    const detailJson = await detailRes.json();
    const messagesJson = await messagesRes.json();

    expect(detailJson.data.messages[0]).toEqual(messagesJson.data.items[0]);
    expect(detailJson.data.messages[0]).toMatchObject({
      direction: 'OUTGOING',
      status: 'FAILED',
      sender: 'Admin',
      metadata: { status: 'FAILED', error: 'LINE unavailable' },
    });
  });
});
