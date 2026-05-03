/**
 * LINE Webhook Event Handler
 *
 * Processes a single LINE WebhookEvent end-to-end:
 *   - Message events (text, image, sticker, other)
 *   - Follow / Unfollow events
 *   - Read receipt events
 *   - Postback events (confirm_payment, view_invoice, send_receipt, balance inquiry)
 *   - Balance inquiry text shortcuts
 *   - Maintenance request flow
 *
 * Called by InboxProcessor once per InboxEvent row.
 * All DB writes are transactional; LINE API calls happen after DB commits.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { WebhookEvent } from '@line/bot-sdk';
import type { Prisma, MessageType } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import {
  sendReplyMessage,
  sendFlexMessage,
  getLineUserProfile,
  type QuickReplyItem,
} from '@/lib/line/client';
import { broadcastLineMessage } from '@/lib/sse/broadcaster';
import { publishChatMessage } from '@/server/websocket';
import { getLatestUnpaidInvoiceForLineUser } from '@/modules/invoices/balance-inquiry';
import { buildInvoiceFlex } from '@/modules/messaging/lineTemplates';
import { isPaymentSettled, PaymentMatchMode } from '@/modules/payments/payment-tolerance';
import {
  startMaintenanceRequest,
  handleMaintenanceRequestMessage,
  handleMaintenanceRequestImage,
  getMaintenanceRequestState,
} from '@/modules/line-maintenance';

// ─── Utilities ────────────────────────────────────────────────────────────────

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
    message?: {
      id?: string;
      type?: string;
      text?: string;
      stickerId?: string;
      packageId?: string;
      duration?: number;
      contentLength?: number;
      contentProvider?: { type?: string; originalFileName?: string };
    };
    postback?: { data?: string };
    replyToken?: string;
  };

  if (evt.type === 'postback') {
    const data = evt.postback?.data || '';
    // Hash the postback data (not replyToken — replyToken changes on LINE retry)
    const dataHash = createHash('sha256').update(data).digest('hex').slice(0, 16);
    return {
      lineMessageId: `postback-${dataHash}`,
      type: 'POSTBACK',
      content: data,
      replyToken: evt.replyToken,
    };
  }

  if (evt.type === 'line@read' || evt.type === 'read') return null;

  if (!evt.message?.id || !evt.message?.type) {
    logger.debug({ type: 'line_event_handler_skip', eventType: evt.type });
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
      replyToken: evt.replyToken,
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

// ─── Postback action router ───────────────────────────────────────────────────

async function handlePostback(
  data: string,
  replyToken: string,
  conversationId: string,
): Promise<void> {
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

    const confirmedPayments = await prisma.payment.findMany({
      where: { matchedInvoiceId: invoiceId, status: 'CONFIRMED' },
    });
    if (confirmedPayments.length === 0) {
      await sendReplyMessage(replyToken, '❌ ไม่พบการชำระเงินสำหรับ invoice นี้ กรุณาติดต่อเจ้าหน้าที่');
      return;
    }

    const totalOwed = Number(invoice.totalAmount) + Number(invoice.lateFeeAmount ?? 0);
    const totalPaid = confirmedPayments.reduce((s, p) => s + Number(p.amount), 0);
    if (!isPaymentSettled(totalPaid, totalOwed, PaymentMatchMode.ALLOW_SMALL_DIFF)) {
      const paid = `฿${totalPaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      const owed = `฿${totalOwed.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
      await sendReplyMessage(replyToken, `❌ ยอดชำระไม่เพียงพอค่ะ\nจ่ายแล้ว: ${paid}\nต้องชำระ: ${owed}\n\nกรุณาติดต่อเจ้าหน้าที่หากมีข้อสงสัยค่ะ`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: { matchedInvoiceId: invoiceId, status: 'CONFIRMED' },
        orderBy: { confirmedAt: 'desc' },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: 'PAID', paidAt: payment?.confirmedAt ?? new Date() },
      });
    });
    await sendReplyMessage(replyToken, `✅ ยืนยันการชำระเงินเรียบร้อยแล้วสำหรับห้อง ${invoice.roomNo} ใบเสร็จจะถูกส่งให้ท่านเร็วๆ นี้ค่ะ 😊`);
    logger.info({ type: 'postback_confirm_payment', invoiceId, conversationId });

  } else if (
    action === 'confirm_payment_inquiry' ||
    action === 'view_invoice_menu' ||
    action === 'send_receipt_menu'
  ) {
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    const userId = conv?.lineUserId ?? '';
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
    await sendReplyMessage(replyToken, `🔗 ดูใบแจ้งหนี้: ${pdfUrl}`);
    logger.info({ type: 'postback_view_invoice', invoiceId, conversationId });

  } else if (action === 'send_receipt') {
    const invoiceId = params.get('invoiceId');
    if (!invoiceId) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบเสร็จที่จะส่ง กรุณาติดต่อเจ้าหน้าที่');
      return;
    }

    const baseUrl = process.env.APP_BASE_URL || '';
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { createSignedInvoiceAccessToken } = await import('@/lib/invoices/access');
    const token = createSignedInvoiceAccessToken({ invoiceId, action: 'pdf', expiresAt });
    const signedUrl = `${baseUrl}/api/invoices/${encodeURIComponent(invoiceId)}/pdf?expires=${expiresAt}&token=${token}`;

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
    if (!invoice?.room) {
      await sendReplyMessage(replyToken, '❌ ไม่พบใบเสร็จ กรุณาติดต่อเจ้าหน้าที่');
      return;
    }

    const lineUserId = invoice.room.tenants?.[0]?.tenant?.lineUserId;
    if (!lineUserId) {
      await sendReplyMessage(replyToken, '❌ ผู้เช่าไม่ได้ลงทะเบียน LINE กรุณาติดต่อเจ้าหน้าที่');
      return;
    }

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
    logger.warn({ type: 'postback_unknown_action', data });
  }
}

// ─── Balance inquiry ──────────────────────────────────────────────────────────

const INQUIRY_TRIGGERS = ['ยอดค้าง', 'ดูยอด', 'ยอดค้างชำระ', 'ใบแจ้งหนี้', 'ดูใบแจ้งหนี้'];

async function handleBalanceInquiry(
  userId: string,
  replyToken: string,
  conversationId: string,
): Promise<void> {
  const result = await getLatestUnpaidInvoiceForLineUser(userId);

  if (result.notLinked) {
    await sendReplyMessage(replyToken, '❌ บัญชี LINE นี้ยังไม่ได้ลงทะเบียนกับห้องพัก กรุณาติดต่อเจ้าหน้าที่เพื่อลงทะเบียนค่ะ');
    return;
  }
  if (!result.hasOutstanding) {
    await sendReplyMessage(replyToken, `✅ ห้อง ${result.roomNo} — ไม่มียอดค้างชำระ ณ ขณะนี้ค่ะ\n\nขอบคุณที่ใช้บริการค่ะ 😊`);
    return;
  }

  const amount = `฿${result.totalAmount!.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
  const statusLabel: Record<string, string> = {
    GENERATED: 'รอดำเนินการ', SENT: 'รอชำระ', VIEWED: 'รอชำระ', OVERDUE: 'เกินกำหนด',
  };
  const statusText = statusLabel[result.status!] ?? result.status ?? '';

  await sendReplyMessage(replyToken, [
    `📊 สรุปยอดค้าง — ห้อง ${result.roomNo}`,
    ``,
    `🔖 เลขที่ใบแจ้งหนี้: ${result.invoiceNumber}`,
    `📅 ครบกำหนดชำระ: ${result.dueDate}`,
    `💰 ยอดค้าง: ${amount}`,
    `📌 สถานะ: ${statusText}`,
    ``,
    `📋 ระยะเวลา: ${result.periodLabel}`,
  ].join('\n'));

  if (result.pdfUrl) {
    const flexContents = {
      type: 'carousel' as const,
      contents: [buildInvoiceFlex({
        roomNumber: result.roomNo!,
        amount,
        dueDate: result.dueDate!,
        invoiceNumber: result.invoiceNumber!,
        paymentLink: result.pdfUrl,
      })],
    };
    await sendFlexMessage(
      userId,
      `📊 ยอดค้าง ${result.invoiceNumber} — ห้อง ${result.roomNo}`,
      flexContents,
      {},
      [
        { label: 'ชำระเงิน',     action: 'uri'     as const, uri:  result.pdfUrl },
        { label: 'ดูใบแจ้งหนี้', action: 'message' as const, text: 'ดูใบแจ้งหนี้' },
      ] satisfies QuickReplyItem[],
    );
  }

  logger.info({ type: 'balance_inquiry_sent', userId, invoiceId: result.invoiceId, conversationId });
}

// ─── Follow event ─────────────────────────────────────────────────────────────

async function persistFollowEvent(userId: string): Promise<void> {
  const existing = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
  if (existing && existing.status !== 'ARCHIVED') return;

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

  const conversation = existing
    ? await prisma.conversation.update({ where: { id: existing.id }, data: { status: 'ACTIVE', lastMessageAt: new Date() } })
    : await prisma.conversation.create({ data: { id: uuidv4(), lineUserId: userId, lastMessageAt: new Date() } });

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
}

async function refreshLineUserProfile(userId: string): Promise<void> {
  try {
    const profile = await getLineUserProfile(userId);
    await prisma.lineUser.upsert({
      where: { lineUserId: userId },
      create: { lineUserId: userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl, statusMessage: profile.statusMessage },
      update: { displayName: profile.displayName, pictureUrl: profile.pictureUrl, statusMessage: profile.statusMessage, lastFetchedAt: new Date() },
    });
  } catch {
    // Non-critical — profile refresh must never fail the event
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function processLineWebhookEvent(
  event: WebhookEvent,
  opts?: { webhookReceivedAt?: number },
): Promise<void> {
  const userId = extractUserId(event);
  if (!userId) return;

  const eventType = (event as { type?: string }).type || 'unknown';

  // ── Read receipt ────────────────────────────────────────────────────────────
  if (eventType === 'line@read' || eventType === 'read') {
    const readEvent = event as { replyToken?: string; read?: { readAt?: number } };
    const conversation = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
    if (!conversation) return;
    const readAt = readEvent.read?.readAt ? new Date(readEvent.read.readAt) : new Date();
    await prisma.message.updateMany({
      where: { conversationId: conversation.id, direction: 'OUTGOING', isRead: false },
      data: { isRead: true, readAt },
    });
    logger.info({ type: 'line_read_receipt', conversationId: conversation.id });
    return;
  }

  // ── Unfollow ────────────────────────────────────────────────────────────────
  if (eventType === 'unfollow') {
    const conversation = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
    if (conversation) {
      await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'ARCHIVED' } });
    }
    return;
  }

  // ── Follow ──────────────────────────────────────────────────────────────────
  if (eventType === 'follow') {
    await persistFollowEvent(userId);
    return;
  }

  // ── Messages and postbacks ──────────────────────────────────────────────────
  const incoming = extractIncomingMessage(event);
  if (!incoming) {
    logger.debug({ type: 'line_event_handler_no_message', eventType });
    return;
  }

  // Get or create conversation
  let conversation = await prisma.conversation.findUnique({ where: { lineUserId: userId } });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { id: uuidv4(), lineUserId: userId, lastMessageAt: new Date() },
    });
  }

  // ── Postback ────────────────────────────────────────────────────────────────
  if (incoming.type === 'POSTBACK' && incoming.replyToken) {
    await handlePostback(incoming.content, incoming.replyToken, conversation.id);
    return;
  }

  // ── Balance inquiry text shortcuts ──────────────────────────────────────────
  if (incoming.type === 'TEXT' && incoming.replyToken) {
    const text = incoming.content.trim();
    if (INQUIRY_TRIGGERS.some((t) => text === t || text.includes(t))) {
      await handleBalanceInquiry(userId, incoming.replyToken, conversation.id);
      return;
    }
  }

  // ── Maintenance request flow ─────────────────────────────────────────────────
  const hasMaintenanceRequest = (await getMaintenanceRequestState(userId)) !== undefined;

  if (incoming.type === 'TEXT' && incoming.replyToken) {
    const text = incoming.content.trim();
    if (text === 'แจ้งซ่อม') {
      const { replyText } = await startMaintenanceRequest(userId);
      await sendReplyMessage(incoming.replyToken, replyText);
      return;
    }
    if (hasMaintenanceRequest) {
      const result = await handleMaintenanceRequestMessage(userId, text);
      if (result) await sendReplyMessage(incoming.replyToken, result.replyText);
      return;
    }
  }

  if (incoming.type === 'IMAGE' && incoming.replyToken && hasMaintenanceRequest) {
    const result = await handleMaintenanceRequestImage(userId, incoming.lineMessageId);
    if (result) await sendReplyMessage(incoming.replyToken, result.replyText);
    return;
  }

  // ── Persist incoming message (dedup by lineMessageId) ───────────────────────
  const existing = await prisma.message.findUnique({ where: { lineMessageId: incoming.lineMessageId } });
  if (existing) return;

  const sentAt = new Date((event as { timestamp?: number }).timestamp || Date.now());
  const messageId = uuidv4();
  const webhookReceivedAt = opts?.webhookReceivedAt ?? Date.now();

  await prisma.$transaction(async (tx) => {
    await tx.message.create({
      data: {
        id: messageId,
        conversation: { connect: { id: conversation!.id } },
        lineMessageId: incoming.lineMessageId,
        direction: 'INCOMING',
        type: incoming.type as MessageType,
        content: incoming.content,
        metadata: incoming.metadata,
        sentAt,
      },
    });
    await tx.conversation.update({
      where: { id: conversation!.id },
      data: { status: 'ACTIVE', lastMessageAt: sentAt, unreadCount: { increment: 1 } },
    });
  });

  // Real-time broadcasts (fire-and-forget — failures must not fail the event)
  try {
    broadcastLineMessage({
      id: messageId,
      type: incoming.type,
      roomNo: conversation.roomNo,
      content: incoming.content,
      createdAt: sentAt.toISOString(),
      tenantId: conversation.tenantId,
      lineMessageId: incoming.lineMessageId,
    });
  } catch { /* SSE broadcast failure is non-fatal */ }

  try {
    publishChatMessage({
      type: 'new_message',
      conversationId: conversation.id,
      messageId,
      senderId: userId,
      timestamp: sentAt.toISOString(),
      content: incoming.content,
      direction: 'INCOMING',
      messageType: incoming.type,
      roomNo: conversation.roomNo,
      webhookReceivedAt,
    });
  } catch { /* WebSocket broadcast failure is non-fatal */ }

  // Profile refresh is non-critical — fire and forget
  void refreshLineUserProfile(userId).catch(() => undefined);

  logger.info({ type: 'line_message_persisted', messageId, conversationId: conversation.id, messageType: incoming.type });
}
