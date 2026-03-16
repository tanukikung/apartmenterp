import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { verifyLineSignature, getLineUserProfile } from '@/lib/line/client';
import { prisma, logger, UnauthorizedError } from '@/lib';
import { v4 as uuidv4 } from 'uuid';
import type { WebhookEvent } from '@line/bot-sdk';
import type { Prisma } from '@prisma/client';

type RawWebhookPayload = { events?: WebhookEvent[] };

function extractUserId(event: WebhookEvent): string | null {
  const source = (event as { source?: { userId?: string } }).source;
  return source?.userId || null;
}

function extractIncomingMessage(event: WebhookEvent): {
  lineMessageId: string;
  type: 'TEXT' | 'IMAGE' | 'STICKER' | 'SYSTEM';
  content: string;
  metadata?: Prisma.InputJsonValue;
} | null {
  const evt = event as {
    type?: string;
    message?: { id?: string; type?: string; text?: string; stickerId?: string; packageId?: string };
    postback?: { data?: string };
  };

  if (evt.type === 'postback') {
    return {
      lineMessageId: evt.message?.id || uuidv4(),
      type: 'SYSTEM',
      content: `Postback: ${evt.postback?.data || 'unknown'}`,
    };
  }

  if (!evt.message?.id || !evt.message?.type) return null;

  if (evt.message.type === 'text') {
    return {
      lineMessageId: evt.message.id,
      type: 'TEXT',
      content: evt.message.text || '',
    };
  }

  if (evt.message.type === 'image') {
    return {
      lineMessageId: evt.message.id,
      type: 'IMAGE',
      content: '[Image]',
    };
  }

  if (evt.message.type === 'sticker') {
    return {
      lineMessageId: evt.message.id,
      type: 'STICKER',
      content: '[Sticker]',
      metadata: {
        stickerId: evt.message.stickerId || null,
        packageId: evt.message.packageId || null,
      },
    };
  }

  return {
    lineMessageId: evt.message.id,
    type: 'SYSTEM',
    content: `[${evt.message.type}]`,
  };
}

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const bodyText = await req.text();
  const signature = req.headers.get('x-line-signature') || '';
  if (!verifyLineSignature(bodyText, signature)) {
    throw new UnauthorizedError('Invalid signature');
  }

  const payload = JSON.parse(bodyText) as RawWebhookPayload;
  const events = Array.isArray(payload.events) ? payload.events : [];

  for (const event of events) {
    const userId = extractUserId(event);
    if (!userId) continue;

    let lineUser = await prisma.lineUser.findUnique({ where: { lineUserId: userId } });
    if (!lineUser) {
      lineUser = await prisma.lineUser.create({
        data: {
          id: uuidv4(),
          lineUserId: userId,
          displayName: 'LINE User',
        },
      });
    }

    try {
      const profile = await getLineUserProfile(userId);
      lineUser = await prisma.lineUser.update({
        where: { id: lineUser.id },
        data: {
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
          statusMessage: profile.statusMessage,
          lastFetchedAt: new Date(),
        },
      });
    } catch {
      // non-blocking
    }

    let conversation = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          id: uuidv4(),
          lineUserId: userId,
          lastMessageAt: new Date(),
        },
      });
    }

    const eventType = (event as { type?: string }).type || 'message';
    if (eventType === 'unfollow') {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: 'ARCHIVED' },
      });
      continue;
    }

    if (eventType === 'follow') {
      await prisma.message.create({
        data: {
          id: uuidv4(),
          conversation: { connect: { id: conversation.id } },
          lineMessageId: uuidv4(),
          direction: 'INCOMING',
          type: 'SYSTEM',
          content: '[Follow event]',
          sentAt: new Date(),
          metadata: {
            eventType: 'follow',
          } as Prisma.InputJsonValue,
        },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: 'ACTIVE',
          lastMessageAt: new Date(),
        },
      });
      continue;
    }

    const incoming = extractIncomingMessage(event);
    if (!incoming) continue;

    await prisma.message.create({
      data: {
        id: uuidv4(),
        conversation: { connect: { id: conversation.id } },
        lineMessageId: incoming.lineMessageId,
        direction: 'INCOMING',
        type: incoming.type,
        content: incoming.content,
        metadata: incoming.metadata,
        sentAt: new Date((event as { timestamp?: number }).timestamp || Date.now()),
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'ACTIVE',
        lastMessageAt: new Date((event as { timestamp?: number }).timestamp || Date.now()),
        unreadCount: { increment: 1 },
      },
    });
  }

  logger.info({ type: 'line_webhook_processed', count: events.length });
  return NextResponse.json({ success: true, data: { processed: events.length } } as ApiResponse<{ processed: number }>);
});
