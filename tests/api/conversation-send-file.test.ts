import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as sendRoute } from '@/app/api/conversations/[id]/files/send/route';
import { prisma } from '@/lib/db/client';
import { makeRequestLike } from '../helpers/auth';

describe('POST /api/conversations/[id]/files/send', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    const line = await import('@/lib/line');
    vi.mocked(line.isLineConfigured).mockReturnValue(true);
  });

  it('uses one transaction and accepts real conversation ids', async () => {
    const convoId = 'conv-validation-ready';
    const fileId = '00000000-0000-0000-0000-000000000002';

    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue({
      id: convoId,
      lineUserId: 'Uxxx',
    } as any);
    vi.spyOn(prisma.uploadedFile, 'findUnique').mockResolvedValue({
      id: fileId,
      originalName: 'x.png',
      mimeType: 'image/png',
      storageKey: 'chat-uploads/k/x.png',
    } as any);
    vi.spyOn(prisma.message, 'create').mockResolvedValue({
      id: 'm-1',
      conversationId: convoId,
      lineMessageId: 'LM-1',
    } as any);
    vi.spyOn(prisma.conversation, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.outboxEvent, 'create').mockResolvedValue({ id: 'evt-1' } as any);

    const req = makeRequestLike({
      url: `http://localhost/api/conversations/${convoId}/files/send`,
      method: 'POST',
      role: 'ADMIN',
      body: { fileId },
    });
    const res = await sendRoute(req as any, { params: { id: convoId } });
    expect(res.status).toBe(202);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed when LINE credentials are unavailable', async () => {
    const line = await import('@/lib/line');
    vi.mocked(line.isLineConfigured).mockReturnValue(false);

    const req = makeRequestLike({
      url: 'http://localhost/api/conversations/conv-validation-ready/files/send',
      method: 'POST',
      role: 'ADMIN',
      body: { fileId: '00000000-0000-0000-0000-000000000002' },
    });
    const res = await sendRoute(req as any, { params: { id: 'conv-validation-ready' } });
    expect(res.status).toBe(503);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
