import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse, NotFoundError, BadRequestError } from '@/lib/utils/errors';
import { prisma, logger } from '@/lib';
import { getOutboxProcessor } from '@/lib/outbox';
import type { Json } from '@/types/prisma-json';

const schema = z.object({
  fileId: z.string().uuid(),
});

export const POST = asyncHandler(async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  const { id: conversationId } = params;
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }
  if (!conversation.lineUserId) {
    throw new BadRequestError('Conversation is not linked to a LINE user');
  }

  const file = await prisma.uploadedFile.findUnique({ where: { id: input.fileId } });
  if (!file) {
    throw new NotFoundError('File not found');
  }

  const message = await prisma.message.create({
    data: {
      conversation: { connect: { id: conversation.id } },
      lineMessageId: crypto.randomUUID(),
      direction: 'OUTGOING',
      type: 'SYSTEM',
      content: JSON.stringify({
        id: file.id,
        name: file.originalName,
        contentType: file.mimeType,
        previewUrl: file.url + '?inline=1',
      }),
      metadata: { status: 'QUEUED' } as unknown as Json,
      sentAt: new Date(),
    },
  });

  const processor = getOutboxProcessor();
  await processor.writeOne(
    'Conversation',
    conversation.id,
    'LineSendFileRequested',
    {
      conversationId: conversation.id,
      messageId: message.id,
      lineUserId: conversation.lineUserId,
      fileUrl: file.url,
      contentType: file.mimeType,
      name: file.originalName,
    } as unknown as Json
  );

  logger.info({
    type: 'chat_file_send_enqueued',
    conversationId: conversation.id,
    messageId: message.id,
    fileId: file.id,
  });

  return NextResponse.json({ success: true, data: { messageId: message.id } } as ApiResponse<{ messageId: string }>, { status: 202 });
});

