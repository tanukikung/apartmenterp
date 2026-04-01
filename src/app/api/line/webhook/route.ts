import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { verifyLineSignature, sendReplyMessage } from '@/lib/line/client';
import { prisma, logger, UnauthorizedError } from '@/lib';
import { v4 as uuidv4 } from 'uuid';
import type { WebhookEvent } from '@line/bot-sdk';
import type { Prisma } from '@prisma/client';
import type { MessageType } from '@prisma/client';

type RawWebhookPayload = { events?: WebhookEvent[] };

function extractUserId(event: WebhookEvent): string | null {
  const source = (event as { source?: { userId?: string } }).source;
  return source?.userId || null;
}

type IncomingMessage = {
  lineMessageId: string;
  type: 'TEXT' | 'IMAGE' | 'STICKER' | 'SYSTEM' | 'POSTBACK';
  content: string;
  metadata?: Prisma.InputJsonValue;
  replyToken?: string;
};

function extractIncomingMessage(event: WebhookEvent): IncomingMessage | null {
  const evt = event as {
    type?: string;
    message?: { id?: string; type?: string; text?: string; stickerId?: string; packageId?: string };
    postback?: { data?: string };
    replyToken?: string;
  };

  if (evt.type === 'postback') {
    const replyToken = evt.replyToken;
    const data = evt.postback?.data || '';
    // Use a hash of replyToken as lineMessageId for deduplication
    const lineMessageId = `postback-${replyToken || uuidv4()}`;
    return {
      lineMessageId,
      type: 'POSTBACK',
      content: data,
      replyToken,
    };
  }

  if (evt.type === 'line@read' || evt.type === 'read') {
    // line@read events don't have a message — handled separately in the main loop
    return null;
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
      } as Prisma.InputJsonValue,
    };
  }

  return {
    lineMessageId: evt.message.id,
    type: 'SYSTEM',
    content: `[${evt.message.type}]`,
  };
}

// ─── Postback Action Router ────────────────────────────────────────────────────
async function handlePostback(data: string, replyToken: string, conversationId: string) {
  const params = new URLSearchParams(data);
  const action = params.get('action');

  if (action === 'confirm_payment') {
    const invoiceId = params.get('invoiceId');
    if (!invoiceId) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบแจ้งหนี้ที่เกี่ยวข้อง กรุณาติดต่อเจ้าหน้าที่');
      return;
    }
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบแจ้งหนี้ กรุณาติดต่อเจ้าหน้าที่');
      return;
    }
    if (invoice.status === 'PAID') {
      await sendReplyMessage(replyToken, `ℹ️ ห้อง ${invoice.roomNo} ชำระเงินแล้วเรียบร้อยค่ะ`);
      return;
    }
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await sendReplyMessage(
      replyToken,
      `✅ ยืนยันการชำระเงินเรียบร้อยแล้วสำหรับห้อง ${invoice.roomNo} ใบเสร็จจะถูกส่งให้ท่านเร็วๆ นี้ค่ะ 😊`
    );
    logger.info({ type: 'postback_confirm_payment', invoiceId, conversationId });

  } else if (action === 'view_invoice') {
    const invoiceId = params.get('invoiceId');
    const baseUrl = process.env.APP_BASE_URL || '';
    if (invoiceId) {
      const invoiceUrl = `${baseUrl}/api/invoices/${invoiceId}/pdf`;
      await sendReplyMessage(
        replyToken,
        `🔗 ดูใบแจ้งหนี้: ${invoiceUrl}`
      );
    } else {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบแจ้งหนี้ กรุณาติดต่อเจ้าหน้าที่');
    }

  } else if (action === 'send_receipt') {
    const invoiceId = params.get('invoiceId');
    if (!invoiceId) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบเสร็จที่จะส่ง กรุณาติดต่อเจ้าหน้าที่');
      return;
    }
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบเสร็จ กรุณาติดต่อเจ้าหน้าที่');
      return;
    }
    const baseUrl = process.env.APP_BASE_URL || '';
    const pdfUrl = `${baseUrl}/api/invoices/${invoiceId}/pdf`;
    await sendReplyMessage(
      replyToken,
      `📋 ดาวน์โหลดใบเสร็จ: ${pdfUrl}`
    );
    logger.info({ type: 'postback_send_receipt', invoiceId, conversationId });

  } else {
    // Unknown action — acknowledge silently
    logger.warn({ type: 'postback_unknown_action', data });
  }
}

// ─── Main Webhook Handler ─────────────────────────────────────────────────────
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

    const eventType = (event as { type?: string }).type || 'message';

    // ── Handle line@read (read receipt) ────────────────────────────────────
    if (eventType === 'line@read' || eventType === 'read') {
      const readEvent = event as { replyToken?: string; read?: { readAt?: number } };
      if (!readEvent.replyToken) continue;
      const conversation = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
      if (!conversation) continue;
      const readAt = readEvent.read?.readAt ? new Date(readEvent.read.readAt) : new Date();
      await prisma.message.updateMany({
        where: { conversationId: conversation.id, direction: 'OUTGOING', isRead: false },
        data: { isRead: true, readAt },
      });
      logger.info({ type: 'line_read_receipt', conversationId: conversation.id });
      continue;
    }

    // ── Handle unfollow ────────────────────────────────────────────────────
    if (eventType === 'unfollow') {
      const conversation = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
      if (conversation) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'ARCHIVED' },
        });
      }
      continue;
    }

    // ── Handle follow ──────────────────────────────────────────────────────
    if (eventType === 'follow') {
      let conversation = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { id: uuidv4(), lineUserId: userId, lastMessageAt: new Date() },
        });
      } else {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: 'ACTIVE', lastMessageAt: new Date() },
        });
      }
      await prisma.message.create({
        data: {
          id: uuidv4(),
          conversation: { connect: { id: conversation.id } },
          lineMessageId: uuidv4(),
          direction: 'INCOMING',
          type: 'SYSTEM',
          content: '[Follow event]',
          sentAt: new Date(),
          metadata: { eventType: 'follow' } as Prisma.InputJsonValue,
        },
      });
      continue;
    }

    // ── Handle incoming messages (text, image, sticker, postback) ────────────
    const incoming = extractIncomingMessage(event);
    if (!incoming) continue;

    let conversation = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { id: uuidv4(), lineUserId: userId, lastMessageAt: new Date() },
      });
    }

    // Handle postback: process action but don't store as visible message
    if (incoming.type === 'POSTBACK' && incoming.replyToken) {
      await handlePostback(incoming.content, incoming.replyToken, conversation.id);
      continue;
    }

    // Deduplicate by lineMessageId
    const existingMessage = await prisma.message.findUnique({
      where: { lineMessageId: incoming.lineMessageId },
    });
    if (existingMessage) continue;

    const sentAt = new Date((event as { timestamp?: number }).timestamp || Date.now());

    await prisma.message.create({
      data: {
        id: uuidv4(),
        conversation: { connect: { id: conversation.id } },
        lineMessageId: incoming.lineMessageId,
        direction: 'INCOMING',
        type: incoming.type as MessageType,
        content: incoming.content,
        metadata: incoming.metadata,
        sentAt,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: 'ACTIVE',
        lastMessageAt: sentAt,
        unreadCount: { increment: 1 },
      },
    });
  }

  logger.info({ type: 'line_webhook_processed', count: events.length });
  return NextResponse.json({ success: true, data: { processed: events.length } } as ApiResponse<{ processed: number }>);
});
