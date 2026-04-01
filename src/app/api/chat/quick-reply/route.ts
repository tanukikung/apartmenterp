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
    requireRole(req, ['ADMIN', 'STAFF']);
    const body = await req.json().catch(() => ({}));
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
      await prisma.invoice.update({
        where: { id: resolvedInvoiceId },
        data: { status: 'PAID', paidAt: new Date() },
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
