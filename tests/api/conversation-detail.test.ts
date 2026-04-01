import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib';
import { GET as conversationDetailRoute } from '@/app/api/conversations/[id]/route';
import { makeRequestLike } from '../helpers/auth';

describe('GET /api/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.conversation.findUnique as any).mockResolvedValue(null);
  });

  it('returns the chat detail page contract for a conversation', async () => {
    (prisma.conversation.findUnique as any).mockResolvedValue({
      id: 'conv-1',
      lineUserId: 'U123',
      status: 'ACTIVE',
      createdAt: new Date('2026-03-15T01:00:00Z'),
      updatedAt: new Date('2026-03-16T02:00:00Z'),
      tenant: {
        id: 'tenant-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '0812345678',
      },
      messages: [
        {
          id: 'msg-1',
          lineMessageId: 'line-1',
          content: 'Hello',
          direction: 'INCOMING',
          type: 'TEXT',
          metadata: { status: 'RECEIVED' },
          isRead: true,
          readAt: new Date('2026-03-15T03:05:00Z'),
          sentAt: new Date('2026-03-15T03:00:00Z'),
        },
        {
          id: 'msg-2',
          lineMessageId: 'line-2',
          content: 'Hi there',
          direction: 'OUTGOING',
          type: 'TEXT',
          metadata: { status: 'FAILED', error: 'LINE failed' },
          isRead: false,
          readAt: null,
          sentAt: new Date('2026-03-15T04:00:00Z'),
        },
      ],
    });

    const res = await conversationDetailRoute(
      makeRequestLike({
        url: 'http://localhost/api/conversations/conv-1',
        method: 'GET',
        role: 'ADMIN',
      }) as any,
      { params: { id: 'conv-1' } } as any,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Response-Time')).toMatch(/ms$/);

    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: {
        id: 'conv-1',
        lineUserId: 'U123',
        status: 'ACTIVE',
        createdAt: '2026-03-15T01:00:00.000Z',
        updatedAt: '2026-03-16T02:00:00.000Z',
        tenant: {
          id: 'tenant-1',
          fullName: 'Ada Lovelace',
          phone: '0812345678',
        },
        messages: [
          {
            id: 'msg-1',
            lineMessageId: 'line-1',
            type: 'TEXT',
            content: 'Hello',
            direction: 'INCOMING',
            metadata: { status: 'RECEIVED' },
            sentAt: '2026-03-15T03:00:00.000Z',
            isRead: true,
            readAt: '2026-03-15T03:05:00.000Z',
            sender: 'Tenant',
            status: 'RECEIVED',
          },
          {
            id: 'msg-2',
            lineMessageId: 'line-2',
            type: 'TEXT',
            content: 'Hi there',
            direction: 'OUTGOING',
            metadata: { status: 'FAILED', error: 'LINE failed' },
            sentAt: '2026-03-15T04:00:00.000Z',
            isRead: false,
            readAt: null,
            sender: 'Admin',
            status: 'FAILED',
          },
        ],
      },
    });
  });

  it('returns 404 when the conversation does not exist', async () => {
    const res = await conversationDetailRoute(
      makeRequestLike({
        url: 'http://localhost/api/conversations/missing',
        method: 'GET',
        role: 'ADMIN',
      }) as any,
      { params: { id: 'missing' } } as any,
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('Conversation');
  });
});
