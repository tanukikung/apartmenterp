import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { prisma, logger } from '@/lib';
import { v4 as uuidv4 } from 'uuid';
import { getOutboxProcessor } from '@/lib/outbox';
import type { Json } from '@/types/prisma-json';

const schema = z.object({
  conversationId: z.string().uuid(),
  fileId: z.string().min(1),
  name: z.string().min(1).optional(),
  contentType: z.string().optional(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
  });
  if (!conversation) {
    throw new NotFoundError('Conversation', input.conversationId);
  }

  const now = new Date();
  const messageId = uuidv4();
  const fileUrlBase = process.env.APP_BASE_URL || '';
  const publicUrl = `${fileUrlBase}/api/files/${encodeURIComponent(input.fileId)}?inline=1`;
  const content = JSON.stringify({
    id: input.fileId,
    name: input.name || input.fileId.split('/').pop() || 'file',
    contentType: input.contentType || 'application/octet-stream',
    previewUrl: publicUrl,
  });

  // Create message as queued
  const message = await prisma.message.create({
    data: {
      id: messageId,
      conversation: { connect: { id: conversation.id } },
      lineMessageId: uuidv4(),
      direction: 'OUTGOING',
      type: 'SYSTEM',
      content,
      sentAt: now,
      metadata: {
        status: 'QUEUED',
        kind: 'file',
      },
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: now },
  });

  // Enqueue outbox event for worker to send via LINE
  const processor = getOutboxProcessor();
  await processor.writeOne(
    'Conversation',
    conversation.id,
    'LineSendFileRequested',
    {
      conversationId: conversation.id,
      messageId: message.id,
      lineUserId: conversation.lineUserId,
      fileUrl: publicUrl,
      contentType: input.contentType || 'application/octet-stream',
      name: input.name || input.fileId.split('/').pop() || 'file',
    } as unknown as Json
  );

  logger.info({
    type: 'chat_file_send_enqueued',
    conversationId: conversation.id,
    messageId: message.id,
    fileId: input.fileId,
  });

  return NextResponse.json({ success: true, data: message } as ApiResponse<typeof message>, { status: 202 });
});
