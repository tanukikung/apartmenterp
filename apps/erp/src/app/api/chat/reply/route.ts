import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getVerifiedActor, requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, NotFoundError, ExternalServiceError } from '@/lib/utils/errors';
import { prisma, sendLineMessage, logger } from '@/lib';
import { logAudit } from '@/modules/audit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json().catch(() => ({}));
  const input = schema.parse(body);
  const actor = getVerifiedActor(req);

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
  });

  if (!conversation) {
    throw new NotFoundError('Conversation', input.conversationId);
  }

  const now = new Date();

  try {
    await sendLineMessage(conversation.lineUserId, input.text);

    const message = await prisma.message.create({
      data: {
        id: uuidv4(),
        conversation: { connect: { id: conversation.id } },
        lineMessageId: uuidv4(),
        direction: 'OUTGOING',
        type: 'TEXT',
        content: input.text,
        sentAt: now,
        metadata: {
          status: 'SENT',
        },
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
        unreadCount: 0,
      },
    });

    logger.info({
      type: 'chat_reply_sent',
      conversationId: conversation.id,
      messageId: message.id,
    });
    
    await logAudit({
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      action: 'CHAT_MESSAGE_SENT',
      entityType: 'CONVERSATION',
      entityId: conversation.id,
      metadata: { messageId: message.id },
    });

    return NextResponse.json({
      success: true,
      data: message,
    } as ApiResponse<typeof message>);
  } catch (error) {
    const message = await prisma.message.create({
      data: {
        id: uuidv4(),
        conversation: { connect: { id: conversation.id } },
        lineMessageId: uuidv4(),
        direction: 'OUTGOING',
        type: 'TEXT',
        content: input.text,
        sentAt: now,
        metadata: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Failed to send LINE message',
        },
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: now,
      },
    });

    logger.error({
      type: 'chat_reply_failed',
      conversationId: conversation.id,
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new ExternalServiceError('LINE', error instanceof Error ? error : new Error('Failed to send LINE message'));
  }
});
