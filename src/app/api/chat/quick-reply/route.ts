import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { prisma, sendFlexMessage, sendTextWithQuickReply, type QuickReplyItem } from '@/lib';
import { logger } from '@/lib/utils/logger';
import {
  buildInvoiceFlex,
  buildReceiptFlex,
  type InvoiceTemplateData,
  type ReceiptTemplateData,
} from '@/modules/messaging/lineTemplates';
import { isPaymentSettled, PaymentMatchMode } from '@/modules/payments/payment-tolerance';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_ATTEMPTS = 20;

export const dynamic = 'force-dynamic';

const quickReplySchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum(['postback:view_invoice', 'postback:confirm_payment', 'postback:send_receipt']),
  invoiceId: z.string().optional(),
});

async function resolveLatestInvoiceId(conversationId: string): Promise<string | null> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conv?.roomNo) return null;
  const invoice = await prisma.invoice.findFirst({
    where: { roomNo: conv.roomNo },
    orderBy: { createdAt: 'desc' },
  });
  return invoice?.id ?? null;
}

async function buildInvoiceData(invoiceId: string): Promise<InvoiceTemplateData | null> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return null;
  const dueDate = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
    : '-';
  return {
    roomNumber: invoice.roomNo,
    amount: `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
    dueDate,
    invoiceNumber: invoice.id.slice(-8).toUpperCase(),
    paymentLink: undefined,
  };
}

export const POST = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`chat-quick-reply:${ip}`, CHAT_MAX_ATTEMPTS, CHAT_WINDOW_MS);
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
    const { conversationId, action, invoiceId } = quickReplySchema.parse(body);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) throw new NotFoundError('Conversation', conversationId);
    if (!conversation.lineUserId) throw new NotFoundError('LINE user not linked to this conversation');

    const lineUserId = conversation.lineUserId;
    const roomNo = conversation.roomNo ?? '-';

    // Resolve invoiceId
    const resolvedInvoiceId = invoiceId ?? (await resolveLatestInvoiceId(conversationId));
    let invoiceData: InvoiceTemplateData | null = null;
    if (resolvedInvoiceId) {
      invoiceData = await buildInvoiceData(resolvedInvoiceId);
    }

    const lineQuickReplies: QuickReplyItem[] = [
      { label: 'ยืนยันชำระเงิน', action: 'postback', data: `action=confirm_payment&invoiceId=${resolvedInvoiceId || ''}` },
      { label: 'ส่งใบเสร็จ', action: 'postback', data: `action=send_receipt&invoiceId=${resolvedInvoiceId || ''}` },
    ];

    if (action === 'postback:view_invoice') {
      if (!invoiceData) {
        await sendTextWithQuickReply(
          lineUserId,
          `📄 ไม่พบใบแจ้งหนี้สำหรับห้อง ${roomNo} กรุณาติดต่อเจ้าหน้าที่`,
          lineQuickReplies
        );
      } else {
        const flexContents = { type: 'carousel' as const, contents: [buildInvoiceFlex(invoiceData)] };
        await sendFlexMessage(lineUserId, `📄 Invoice ${invoiceData.invoiceNumber} - ห้อง ${invoiceData.roomNumber}`, flexContents, {}, lineQuickReplies);
      }
      logger.info({ type: 'quick_reply_sent', action, conversationId, invoiceId: resolvedInvoiceId });

    } else if (action === 'postback:confirm_payment') {
      if (!resolvedInvoiceId) {
        await sendTextWithQuickReply(lineUserId, `❌ ไม่พบใบแจ้งหนี้ที่รอชำระ กรุณาติดต่อเจ้าหน้าที่`, []);
        return NextResponse.json({ success: true, data: { sent: false, reason: 'no_invoice' } } as ApiResponse<unknown>);
      }
      const invoice = await prisma.invoice.findUnique({ where: { id: resolvedInvoiceId } });
      if (!invoice) {
        await sendTextWithQuickReply(lineUserId, `❌ ไม่พบใบแจ้งหนี้ กรุณาติดต่อเจ้าหน้าที่`, []);
        return NextResponse.json({ success: true, data: { sent: false, reason: 'invoice_not_found' } } as ApiResponse<unknown>);
      }
      if (invoice.status === 'PAID') {
        await sendTextWithQuickReply(lineUserId, `ℹ️ ห้อง ${invoice.roomNo} ชำระเงินแล้วเรียบร้อยค่ะ`, []);
        return NextResponse.json({ success: true, data: { sent: false, reason: 'already_paid' } } as ApiResponse<unknown>);
      }

      // Verify CONFIRMED payments actually exist and cover the full amount
      const confirmedPayments = await prisma.payment.findMany({
        where: { matchedInvoiceId: resolvedInvoiceId, status: 'CONFIRMED' },
      });
      if (confirmedPayments.length === 0) {
        await sendTextWithQuickReply(lineUserId, `❌ ไม่พบการชำระเงินสำหรับ invoice นี้ กรุณาติดต่อเจ้าหน้าที่`, []);
        return NextResponse.json({ success: true, data: { sent: false, reason: 'no_payment' } } as ApiResponse<unknown>);
      }

      const invoiceTotal = Number(invoice.totalAmount);
      const lateFeeAmount = Number(invoice.lateFeeAmount ?? 0);
      const totalOwed = invoiceTotal + lateFeeAmount;
      const totalPaid = confirmedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const settled = isPaymentSettled(totalPaid, totalOwed, PaymentMatchMode.ALLOW_SMALL_DIFF);

      if (!settled) {
        const paidAmount = `฿${totalPaid.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        const expectedAmount = `฿${totalOwed.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        await sendTextWithQuickReply(
          lineUserId,
          `❌ ยอดชำระไม่เพียงพอค่ะ\nจ่ายแล้ว: ${paidAmount}\nต้องชำระ: ${expectedAmount}\n\nกรุณาติดต่อเจ้าหน้าที่หากมีข้อสงสัยค่ะ`,
          []
        );
        return NextResponse.json({ success: true, data: { sent: false, reason: 'insufficient_payment' } } as ApiResponse<unknown>);
      }

      // Use syncInvoicePaymentState pattern — do NOT set PAID directly without verified payment
      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findFirst({
          where: { matchedInvoiceId: resolvedInvoiceId, status: 'CONFIRMED' },
          orderBy: { confirmedAt: 'desc' },
        });
        await tx.invoice.update({
          where: { id: resolvedInvoiceId },
          data: {
            status: 'PAID',
            paidAt: payment?.confirmedAt ?? new Date(),
          },
        });
      });
      await sendTextWithQuickReply(
        lineUserId,
        `✅ ยืนยันการชำระเงินเรียบร้อยแล้วสำหรับห้อง ${invoice.roomNo} ใบเสร็จจะถูกส่งให้เร็วๆ นี้`,
        [{ label: 'ส่งใบเสร็จทันที', action: 'postback', data: `action=send_receipt&invoiceId=${resolvedInvoiceId}` }]
      );
      logger.info({ type: 'payment_confirmed_via_quick_reply', invoiceId: resolvedInvoiceId, conversationId });

    } else if (action === 'postback:send_receipt') {
      if (!resolvedInvoiceId) {
        await sendTextWithQuickReply(lineUserId, `❌ ไม่พบใบเสร็จที่จะส่ง กรุณาติดต่อเจ้าหน้าที่`, []);
        return NextResponse.json({ success: true, data: { sent: false, reason: 'no_invoice' } } as ApiResponse<unknown>);
      }
      const invoice = await prisma.invoice.findUnique({ where: { id: resolvedInvoiceId } });
      if (!invoice) {
        await sendTextWithQuickReply(lineUserId, `❌ ไม่พบใบเสร็จ กรุณาติดต่อเจ้าหน้าที่`, []);
        return NextResponse.json({ success: true, data: { sent: false, reason: 'invoice_not_found' } } as ApiResponse<unknown>);
      }
      const baseUrl = process.env.APP_BASE_URL || '';
      const pdfUrl = `${baseUrl}/api/invoices/${encodeURIComponent(resolvedInvoiceId)}/pdf`;
      const paidDate = invoice.paidAt
        ? new Date(invoice.paidAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
        : new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      const receiptData: ReceiptTemplateData = {
        roomNumber: invoice.roomNo,
        amount: `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
        paidDate,
        invoiceNumber: invoice.id.slice(-8).toUpperCase(),
        downloadLink: pdfUrl,
      };
      const flexContents = { type: 'carousel' as const, contents: [buildReceiptFlex(receiptData)] };
      await sendFlexMessage(lineUserId, `✅ Receipt - ห้อง ${roomNo} - ${receiptData.amount}`, flexContents);
      logger.info({ type: 'receipt_sent_via_quick_reply', invoiceId: resolvedInvoiceId, conversationId });
    }

    return NextResponse.json({ success: true, data: { sent: true } } as ApiResponse<unknown>);
  }
);
