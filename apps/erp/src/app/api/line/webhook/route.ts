import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { verifyLineSignature, parseWebhookEvent } from '@/lib';
import { prisma, logger, UnauthorizedError } from '@/lib';
import { v4 as uuidv4 } from 'uuid';
import type { WebhookEvent } from '@line/bot-sdk';
import type { Prisma } from '@prisma/client';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const bodyText = await req.text();
  const signature = req.headers.get('x-line-signature') || '';
  if (!verifyLineSignature(bodyText, signature)) {
    throw new UnauthorizedError('Invalid signature');
  }

  const payload = JSON.parse(bodyText) as { events?: unknown[] };
  const events = Array.isArray(payload.events) ? payload.events : [];

  for (const raw of events) {
    const e = parseWebhookEvent(raw as WebhookEvent);
    if (!e.userId) continue;

    // Ensure LineUser
    let lineUser = await prisma.lineUser.findUnique({ where: { lineUserId: e.userId } });
    if (!lineUser) {
      lineUser = await prisma.lineUser.create({
        data: {
          id: uuidv4(),
          lineUserId: e.userId,
          displayName: 'Unknown',
        },
      });
    }

    // Ensure Conversation (one per line user)
    let conversation = await prisma.conversation.findUnique({ where: { lineUserId: e.userId } });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          id: uuidv4(),
          lineUserId: e.userId,
          lastMessageAt: new Date(e.timestamp),
        },
      });
    }

    // Store Message
    if (e.messageText) {
      const data: Prisma.MessageCreateInput = {
        id: uuidv4(),
        conversation: { connect: { id: conversation.id } },
        lineMessageId: e.messageId || uuidv4(),
        direction: 'INCOMING',
        type: 'TEXT',
        content: e.messageText,
        sentAt: new Date(e.timestamp),
      } as unknown as Prisma.MessageCreateInput;
      await prisma.message.create({ data });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(e.timestamp),
          unreadCount: { increment: 1 },
        },
      });
    }
  }

  logger.info({ type: 'line_webhook_processed', count: events.length });
  return NextResponse.json({ success: true, data: { processed: events.length } } as ApiResponse<{ processed: number }>);
});
