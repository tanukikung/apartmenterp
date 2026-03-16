import { describe, it, expect, vi } from 'vitest';
import { POST as sendRoute } from '@/app/api/conversations/[id]/files/send/route';
import { prisma } from '@/lib/db/client';
import { getOutboxProcessor } from '@/lib/outbox';

describe('POST /api/conversations/[id]/files/send', () => {
  it('enqueues event and creates message', async () => {
    const convoId = '00000000-0000-0000-0000-000000000001';
    const fileId = '00000000-0000-0000-0000-000000000002';
    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue({
      id: convoId,
      lineUserId: 'Uxxx',
    } as any);
    vi.spyOn(prisma.uploadedFile, 'findUnique').mockResolvedValue({
      id: fileId,
      originalName: 'x.png',
      mimeType: 'image/png',
      url: '/api/files/chat-uploads/k/x.png',
    } as any);
    vi.spyOn(prisma.message, 'create').mockResolvedValue({
      id: 'm-1',
      conversationId: convoId,
      lineMessageId: 'LM-1',
    } as any);
    const writeOne = vi.fn(async () => {});
    vi.spyOn(await import('@/lib/outbox'), 'getOutboxProcessor').mockReturnValue({ writeOne } as any);

    const req: any = {
      json: async () => ({ fileId }),
    };
    const res = await sendRoute(req as any, { params: { id: convoId } });
    expect(res.status).toBe(202);
    expect(writeOne).toHaveBeenCalled();
  });
});

