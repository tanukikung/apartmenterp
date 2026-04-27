import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { verifyLineSignature, sendReplyMessage, sendFlexMessage, getLineUserProfile } from '@/lib/line/client';
import { prisma, logger, UnauthorizedError } from '@/lib';
import { broadcastLineMessage } from '@/lib/sse/broadcaster';
import { v4 as uuidv4 } from 'uuid';
import type { WebhookEvent } from '@line/bot-sdk';
import type { Prisma } from '@prisma/client';
import type { MessageType } from '@prisma/client';
import { getLatestUnpaidInvoiceForLineUser } from '@/modules/invoices/balance-inquiry';
import { buildInvoiceFlex } from '@/modules/messaging/lineTemplates';
import {
  startMaintenanceRequest,
  handleMaintenanceRequestMessage,
  handleMaintenanceRequestImage,
  getMaintenanceRequestState,
} from '@/modules/line-maintenance';

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
    message?: { id?: string; type?: string; text?: string; stickerId?: string; packageId?: string; duration?: number; contentLength?: number; contentProvider?: { type?: string; originalFileName?: string } };
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

  if (!evt.message?.id || !evt.message?.type) {
    logger.debug({ type: 'line_webhook_message_missing_fields', eventType: evt.type, messageId: evt.message?.id });
    return null;
  }

  if (evt.message.type === 'text') {
    return {
      lineMessageId: evt.message.id,
      type: 'TEXT',
      content: evt.message.text || '',
      replyToken: evt.replyToken,
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
    metadata: {
      duration: evt.message.duration ?? null,
      fileSize: evt.message.contentLength ?? null,
      originalFileName: evt.message.contentProvider?.originalFileName ?? null,
    } as Prisma.InputJsonValue,
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
    // SECURITY: Check PAID first — make this action idempotent.
    // If LINE retries after invoice is already PAID, return early (still reply so LINE gets a response).
    if (invoice.status === 'PAID') {
      await sendReplyMessage(replyToken, `ℹ️ ห้อง ${invoice.roomNo} ชำระเงินแล้วเรียบร้อยค่ะ`);
      return;
    }

    // Verify a CONFIRMED payment actually exists for this invoice with sufficient amount
    const confirmedPayments = await prisma.payment.findMany({
      where: {
        matchedInvoiceId: invoiceId,
        status: 'CONFIRMED',
      },
    });

    if (confirmedPayments.length === 0) {
      await sendReplyMessage(
        replyToken,
        '❌ ไม่พบการชำระเงินสำหรับ invoice นี้ กรุณาติดต่อเจ้าหน้าที่'
      );
      return;
    }

    const invoiceTotal = Number(invoice.totalAmount);
    const totalPaid = confirmedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    if (totalPaid < invoiceTotal - 0.01) {
      const paidAmount = `฿${totalPaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      const expectedAmount = `฿${invoiceTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      await sendReplyMessage(
        replyToken,
        `❌ ยอดชำระไม่เพียงพอค่ะ\nจ่ายแล้ว: ${paidAmount}\nต้องชำระ: ${expectedAmount}\n\nกรุณาติดต่อเจ้าหน้าที่หากมีข้อสงสัยค่ะ`
      );
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

  } else if (action === 'confirm_payment_inquiry') {
    // Rich menu "ยืนยันชำระเงิน" button — show outstanding invoices via balance inquiry
    const userId = (await prisma.conversation.findUnique({ where: { id: conversationId } }))?.lineUserId ?? '';
    await handleBalanceInquiry(userId, replyToken, conversationId);

  } else if (action === 'view_invoice_menu') {
    // Rich menu "ดูใบแจ้งหนี้" — show outstanding invoices via balance inquiry (user selects one)
    const userId = (await prisma.conversation.findUnique({ where: { id: conversationId } }))?.lineUserId ?? '';
    await handleBalanceInquiry(userId, replyToken, conversationId);

  } else if (action === 'send_receipt_menu') {
    // Rich menu "ส่งใบเสร็จ" — show outstanding invoices then user picks to request receipt
    const userId = (await prisma.conversation.findUnique({ where: { id: conversationId } }))?.lineUserId ?? '';
    await handleBalanceInquiry(userId, replyToken, conversationId);

  } else if (action === 'view_invoice') {
    const invoiceId = params.get('invoiceId');
    if (!invoiceId) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบแจ้งหนี้ กรุณาติดต่อเจ้าหน้าที่');
      return;
    }
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบแจ้งหนี้ กรุณาติดต่อเจ้าหน้าที่');
      return;
    }
    const baseUrl = process.env.APP_BASE_URL || '';
    const pdfUrl = `${baseUrl}/api/invoices/${encodeURIComponent(invoiceId)}/pdf`;
    await sendReplyMessage(
      replyToken,
      `🔗 ดูใบแจ้งหนี้: ${pdfUrl}`
    );
    logger.info({ type: 'postback_view_invoice', invoiceId, conversationId });

  } else if (action === 'send_receipt') {
    const invoiceId = params.get('invoiceId');
    if (!invoiceId) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบเสร็จที่จะส่ง กรุณาติดต่อเจ้าหน้าที่');
      return;
    }

    // Fetch signed URL for this invoice (same auth as /pdf route)
    const baseUrl = process.env.APP_BASE_URL || '';
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { createSignedInvoiceAccessToken } = await import('@/lib/invoices/access');
    const token = createSignedInvoiceAccessToken({
      invoiceId,
      action: 'pdf',
      expiresAt,
    });
    const signedUrl = `${baseUrl}/api/invoices/${encodeURIComponent(invoiceId)}/pdf?expires=${expiresAt}&token=${token}`;

    // Look up tenant's LINE user ID
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        room: {
          include: {
            tenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
            },
          },
        },
      },
    });

    if (!invoice || !invoice.room) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบเสร็จ กรุณาติดต่อเจ้าหน้าที่');
      return;
    }

    const tenant = invoice.room.tenants?.[0]?.tenant;
    const lineUserId = tenant?.lineUserId;

    if (!lineUserId) {
      await sendReplyMessage(replyToken, '❌ ผู้เช่าไม่ได้ลงทะเบียน LINE กรุณาติดต่อเจ้าหน้าที่');
      return;
    }

    // Send Flex receipt card via LINE using the same pattern as payment-notifier
    const paidDate = invoice.paidAt
      ? new Date(invoice.paidAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

    const { sendReceiptMessage } = await import('@/modules/messaging');
    await sendReceiptMessage(lineUserId, {
      roomNumber: invoice.roomNo,
      amount: `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      paidDate,
      invoiceNumber: invoice.id.slice(-8).toUpperCase(),
      downloadLink: signedUrl,
    });

    await sendReplyMessage(replyToken, `📋 ส่งใบเสร็จให้ท่านแล้วค่ะ กรุณาตรวจสอบที่หน้าต่าง LINE ของท่านได้เลยค่ะ 😊`);
    logger.info({ type: 'postback_send_receipt', invoiceId, conversationId });

  } else {
    // Unknown action — acknowledge silently
    logger.warn({ type: 'postback_unknown_action', data });
  }
}

// ─── Balance Inquiry Handler ─────────────────────────────────────────────────

const INQUIRY_TRIGGERS = ['ยอดค้าง', 'ดูยอด', 'ยอดค้างชำระ', 'ใบแจ้งหนี้', 'ดูใบแจ้งหนี้'];

async function handleBalanceInquiry(
  userId: string,
  replyToken: string,
  conversationId: string
): Promise<void> {
  const result = await getLatestUnpaidInvoiceForLineUser(userId);

  if (result.notLinked) {
    await sendReplyMessage(
      replyToken,
      '❌ บัญชี LINE นี้ยังไม่ได้ลงทะเบียนกับห้องพัก กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียนค่ะ'
    );
    return;
  }

  if (!result.hasOutstanding) {
    await sendReplyMessage(
      replyToken,
      `✅ ห้อง ${result.roomNo} — ไม่มียอดค้างชำระ ณ ขณะนี้ค่ะ\n\nขอบคุณที่ใช้บริการค่ะ 😊`
    );
    return;
  }

  // totalAmount from invoice query already includes lateFeeAmount when invoice is OVERDUE
  const effectiveAmount = result.totalAmount!;
  const amount = `฿${effectiveAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
  const statusLabel: Record<string, string> = {
    GENERATED: 'รอดำเนินการ',
    SENT: 'รอชำระ',
    VIEWED: 'รอชำระ',
    OVERDUE: 'เกินกำหนด',
  };

  const statusText = statusLabel[result.status!] ?? result.status ?? '';
  const replyText = [
    `📊 สรุปยอดค้าง — ห้อง ${result.roomNo}`,
    ``,
    `🔖 เลขที่ใบแจ้งหนี้: ${result.invoiceNumber}`,
    `📅 ครบกำหนดชำระ: ${result.dueDate}`,
    `💰 ยอดค้าง: ${amount}`,
    `📌 สถานะ: ${statusText}`,
    ``,
    `📋 ระยะเวลา: ${result.periodLabel}`,
  ].join('\n');

  // Send summary text first, then follow up with quick reply payment button
  await sendReplyMessage(replyToken, replyText);

  if (result.pdfUrl) {
    const quickReplies = [
      {
        type: 'action' as const,
        action: 'uri' as const,
        label: 'ชำระเงิน',
        uri: result.pdfUrl,
      },
      {
        type: 'action' as const,
        action: 'message' as const,
        label: 'ดูใบแจ้งหนี้',
        text: 'ดูใบแจ้งหนี้',
      },
    ];

    const invoiceData = {
      roomNumber: result.roomNo!,
      amount,
      dueDate: result.dueDate!,
      invoiceNumber: result.invoiceNumber!,
      paymentLink: result.pdfUrl,
    };
    const flexContents = { type: 'carousel' as const, contents: [buildInvoiceFlex(invoiceData)] };
    await sendFlexMessage(
      userId,
      `📊 ยอดค้าง ${result.invoiceNumber} — ห้อง ${result.roomNo}`,
      flexContents,
      {},
      quickReplies
    );
  }

  logger.info({ type: 'balance_inquiry_sent', userId, invoiceId: result.invoiceId, conversationId });
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
    try {
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
        // Idempotent: skip if conversation already exists and is not ARCHIVED
        const existingConv = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
        if (existingConv && existingConv.status !== 'ARCHIVED') {
          // Already have an active conversation — acknowledge without reprocessing
          continue;
        }

        // Fetch real LINE profile and upsert LineUser with real data
        let displayName = 'LINE User';
        let pictureUrl: string | null = null;
        let statusMessage: string | null = null;
        try {
          const profile = await getLineUserProfile(userId);
          displayName = profile.displayName;
          pictureUrl = profile.pictureUrl;
          statusMessage = profile.statusMessage;
        } catch (err) {
          logger.warn({ type: 'line_profile_fetch_failed', userId, error: (err as Error).message });
        }

        // Ensure LineUser record exists before creating Conversation (required FK).
        // Use upsert so this is idempotent — safe to call even if the record already exists.
        await prisma.lineUser.upsert({
          where: { lineUserId: userId },
          create: { lineUserId: userId, displayName, pictureUrl, statusMessage },
          update: { displayName, pictureUrl, statusMessage, lastFetchedAt: new Date() },
        });

        const conversation = existingConv
          ? await prisma.conversation.update({
              where: { id: existingConv.id },
              data: { status: 'ACTIVE', lastMessageAt: new Date() },
            })
          : await prisma.conversation.create({
              data: { id: uuidv4(), lineUserId: userId, lastMessageAt: new Date() },
            });
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
      if (!incoming) {
        logger.debug({ type: 'line_webhook_skipped_event', eventType });
        continue;
      }

      // Ensure LineUser record exists and has current profile data.
      let displayName = 'LINE User';
      let pictureUrl: string | null = null;
      let statusMessage: string | null = null;
      try {
        const profile = await getLineUserProfile(userId);
        displayName = profile.displayName;
        pictureUrl = profile.pictureUrl;
        statusMessage = profile.statusMessage;
      } catch (err) {
        logger.warn({ type: 'line_profile_fetch_failed', userId, error: (err as Error).message });
      }
      await prisma.lineUser.upsert({
        where: { lineUserId: userId },
        create: { lineUserId: userId, displayName, pictureUrl, statusMessage },
        update: { displayName, pictureUrl, statusMessage, lastFetchedAt: new Date() },
      });

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

      // ── Balance / invoice inquiry via text ───────────────────────────────────
      if (incoming.type === 'TEXT' && incoming.replyToken) {
        const text = (incoming.content || '').trim();
        if (INQUIRY_TRIGGERS.some((t) => text === t || text.includes(t))) {
          await handleBalanceInquiry(userId, incoming.replyToken, conversation.id);
          continue;
        }
      }

      // ── LINE Maintenance Request handling ──────────────────────────────────
      // Check if user has an in-progress maintenance request
      const hasMaintenanceRequest = await getMaintenanceRequestState(userId) !== undefined;

      if (incoming.type === 'TEXT' && incoming.replyToken) {
        const text = (incoming.content || '').trim();

        // Start maintenance request when user says "แจ้งซ่อม"
        if (text === 'แจ้งซ่อม') {
          const { replyText } = await startMaintenanceRequest(userId);
          await sendReplyMessage(incoming.replyToken, replyText);
          continue;
        }

        // Handle in-progress maintenance conversation
        if (hasMaintenanceRequest) {
          const result = await handleMaintenanceRequestMessage(userId, text);
          if (result) {
            await sendReplyMessage(incoming.replyToken, result.replyText);
            continue;
          }
        }
      }

      // Handle image messages during a maintenance request flow
      if (incoming.type === 'IMAGE' && incoming.replyToken) {
        if (hasMaintenanceRequest) {
          const imageMessageId = incoming.lineMessageId;
          const result = await handleMaintenanceRequestImage(userId, imageMessageId);
          if (result) {
            await sendReplyMessage(incoming.replyToken, result.replyText);
            continue;
          }
        }
      }

      // Deduplicate by lineMessageId
      const existingMessage = await prisma.message.findUnique({
        where: { lineMessageId: incoming.lineMessageId },
      });
      if (existingMessage) continue;

      const sentAt = new Date((event as { timestamp?: number }).timestamp || Date.now());
      const messageId = uuidv4();

      await prisma.message.create({
        data: {
          id: messageId,
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

      // Broadcast to SSE clients so chat UI updates in real-time
      broadcastLineMessage({
        id: messageId,
        type: incoming.type,
        roomNo: conversation.roomNo,
        content: incoming.content,
        createdAt: sentAt.toISOString(),
        tenantId: conversation.tenantId,
        lineMessageId: incoming.lineMessageId,
      });
    } catch (err) {
      logger.error({
        type: 'line_webhook_event_error',
        event: event as Record<string, unknown>,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ type: 'line_webhook_processed', count: events.length });
  return NextResponse.json({ success: true, data: { processed: events.length } } as ApiResponse<{ processed: number }>);
});
