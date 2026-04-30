import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, NotFoundError, ExternalServiceError } from '@/lib/utils/errors';
import { prisma, sendLineMessage, logger } from '@/lib';
import { logAudit } from '@/modules/audit';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_ATTEMPTS = 20;

export const dynamic = 'force-dynamic';

const schema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().min(1),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`chat-reply:${ip}`, CHAT_MAX_ATTEMPTS, CHAT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many chat requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
  const input = schema.parse(body);

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
      req,
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
