import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getVerifiedActor, requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, NotFoundError, ExternalServiceError } from '@/lib/utils/errors';
import { prisma, sendLineMessage } from '@/lib';
import { logAudit } from '@/modules/audit';
import { logger } from '@/lib/utils/logger';
import { withTiming } from '@/lib/performance/timingMiddleware';
import { toConversationMessageDto } from '@/modules/messaging/message-dto';

export const dynamic = 'force-dynamic';

const getMessages = asyncHandler(async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const { id } = params;
  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const beforeParam = url.searchParams.get('before');
  const limit = limitParam ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 30)) : 100;
  const before = beforeParam ? new Date(beforeParam) : null;

  if (!limit) {
    // Safety cap: prevent unbounded fetch when limit param is absent
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { sentAt: 'asc' },
      take: 200,
      include: {
        conversation: {
          include: {
            room: true,
            tenant: true,
          }
        }
      },
    });
    return NextResponse.json({
      success: true,
      data: messages.map(toConversationMessageDto),
    } as ApiResponse<unknown>);
  }

  const messagesDesc = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(before ? { sentAt: { lt: before } } : {}),
    },
    orderBy: { sentAt: 'desc' },
    take: limit + 1,
    include: {
      conversation: {
        include: {
          room: true,
          tenant: true,
        }
      }
    },
  });
  const hasMore = messagesDesc.length > limit;
  const pageItems = hasMore ? messagesDesc.slice(0, limit) : messagesDesc;
  const items = pageItems.slice().reverse().map(toConversationMessageDto);
  const nextBefore = pageItems.length > 0 ? pageItems[pageItems.length - 1].sentAt.toISOString() : null;

  return NextResponse.json({ success: true, data: { items, nextBefore, hasMore } } as ApiResponse<unknown>);
});

export const GET = withTiming(getMessages);

const sendMessageSchema = z.object({
  text: z.string().min(1),
});

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF']);
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const input = sendMessageSchema.parse(body);
    const actor = getVerifiedActor(req);

    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation', id);
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
        },
      });

      logger.info({
        type: 'admin_reply_sent',
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
        type: 'admin_reply_failed',
        conversationId: conversation.id,
        messageId: message.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ExternalServiceError('LINE', error instanceof Error ? error : new Error('Failed to send LINE message'));
    }
  }
);
