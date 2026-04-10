import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { buildFileAccessUrl } from '@/lib/files/access';
import { BadRequestError, NotFoundError } from '@/lib/utils/errors';
import type { Json } from '@/types/prisma-json';

type QueueConversationFileSendInput = {
  conversationId: string;
  fileId: string;
  name?: string;
  contentType?: string;
};

export async function queueConversationFileSend(input: QueueConversationFileSendInput) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findUnique({
      where: { id: input.conversationId },
    });
    if (!conversation) {
      throw new NotFoundError('Conversation', input.conversationId);
    }
    if (!conversation.lineUserId) {
      throw new BadRequestError('Conversation is not linked to a LINE user');
    }

    const uploadedFile = await tx.uploadedFile.findUnique({
      where: { id: input.fileId },
    });

    const storageKey = uploadedFile?.storageKey ?? input.fileId;
    const contentType = input.contentType || uploadedFile?.mimeType || 'application/octet-stream';
    const name = input.name || uploadedFile?.originalName || storageKey.split('/').pop() || 'file';
    const previewUrl = buildFileAccessUrl(storageKey, { inline: true });
    const fileUrl = buildFileAccessUrl(storageKey, {
      absoluteBaseUrl: process.env.APP_BASE_URL || '',
      inline: true,
      signed: true,
    });

    const message = await tx.message.create({
      data: {
        id: uuidv4(),
        conversation: { connect: { id: conversation.id } },
        lineMessageId: uuidv4(),
        direction: 'OUTGOING',
        type: 'SYSTEM',
        content: JSON.stringify({
          id: uploadedFile?.id ?? input.fileId,
          name,
          contentType,
          previewUrl,
        }),
        metadata: {
          status: 'QUEUED',
          kind: 'file',
        } as any,
        sentAt: now,
      },
    });

    await tx.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: now },
    });

    await tx.outboxEvent.create({
      data: {
        id: uuidv4(),
        aggregateType: 'Conversation',
        aggregateId: conversation.id,
        eventType: 'LineSendFileRequested',
        payload: {
          conversationId: conversation.id,
          messageId: message.id,
          lineUserId: conversation.lineUserId,
          fileUrl,
          contentType,
          name,
        } as any,
      },
    });

    return message;
  });
}
