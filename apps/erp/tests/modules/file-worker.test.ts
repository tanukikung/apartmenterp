import { describe, it, expect, vi } from 'vitest';
import { getEventBus } from '@/lib';
import { registerFileSendWorker } from '@/modules/messaging/file-send.worker';
import { prisma } from '@/lib/db/client';
import { sendLineImageMessage, sendLineMessage } from '@/lib';

describe('file-send.worker', () => {
  it('handles LineSendFileRequested success for image', async () => {
    const bus = getEventBus();
    registerFileSendWorker({ allowInTest: true });
    vi.spyOn(prisma.message, 'update').mockResolvedValue({} as any);
    vi.spyOn(await import('@/lib'), 'sendLineImageMessage').mockResolvedValue(undefined as any);

    await bus.publish<any>('LineSendFileRequested', 'Conversation', 'c-1', {
      conversationId: 'c-1',
      messageId: 'm-1',
      lineUserId: 'Uxxx',
      fileUrl: 'https://example.com/a.png',
      contentType: 'image/png',
      name: 'a.png',
    });
    expect(prisma.message.update).toHaveBeenCalled();
  });

  it('handles LineSendFileRequested failure', async () => {
    const bus = getEventBus();
    registerFileSendWorker({ allowInTest: true });
    vi.spyOn(prisma.message, 'update').mockResolvedValue({} as any);
    vi.spyOn(await import('@/lib'), 'sendLineMessage').mockRejectedValue(new Error('fail'));

    await bus.publish<any>('LineSendFileRequested', 'Conversation', 'c-1', {
      conversationId: 'c-1',
      messageId: 'm-1',
      lineUserId: 'Uxxx',
      fileUrl: 'https://example.com/a.pdf',
      contentType: 'application/pdf',
      name: 'a.pdf',
    });
    expect(prisma.message.update).toHaveBeenCalled();
  });
});
