import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';
import { sendReceiptMessage } from '@/modules/messaging';
import { requireOperatorOrSignedInvoiceAccess } from '@/lib/invoices/access';

/**
 * POST /api/invoices/[id]/receipt/line
 * Send receipt to tenant via LINE using the InvoicePaid event flow.
 * Requires signed invoice access token OR admin session.
 */
export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id: invoiceId } = params;

    // Authorize: signed token from tenant OR admin session
    requireOperatorOrSignedInvoiceAccess(req, invoiceId, 'pdf');

    // Fetch invoice with tenant info
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
      return NextResponse.json({ success: false, error: { name: 'NotFound', message: 'Invoice not found', code: 'NOT_FOUND', statusCode: 404 } }, { status: 404 });
    }

    const tenant = invoice.room.tenants?.[0]?.tenant;
    const lineUserId = tenant?.lineUserId;

    if (!lineUserId) {
      logger.warn({ type: 'receipt_line_no_line_user', invoiceId });
      return NextResponse.json({ success: false, error: { name: 'BadRequest', message: 'Tenant not linked to LINE', code: 'NO_LINE_USER', statusCode: 400 } }, { status: 400 });
    }

    const baseUrl = process.env.APP_BASE_URL || '';
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const { createSignedInvoiceAccessToken } = await import('@/lib/invoices/access');
    const token = createSignedInvoiceAccessToken({
      invoiceId,
      action: 'pdf',
      expiresAt,
    });
    const signedUrl = `${baseUrl}/api/invoices/${encodeURIComponent(invoiceId)}/pdf?expires=${expiresAt}&token=${token}`;

    const paidDate = invoice.paidAt
      ? new Date(invoice.paidAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

    await sendReceiptMessage(lineUserId, {
      roomNumber: invoice.roomNo,
      amount: `฿${Number(invoice.totalAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`,
      paidDate,
      invoiceNumber: invoice.id.slice(-8).toUpperCase(),
      downloadLink: signedUrl,
    });

    logger.info({ type: 'receipt_sent_to_tenant', invoiceId, lineUserId });

    return NextResponse.json({ success: true, data: null });
  }
);
