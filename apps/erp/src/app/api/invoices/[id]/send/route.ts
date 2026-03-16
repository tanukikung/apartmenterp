import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { sendInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getOutboxProcessor } from '@/lib/outbox';
import { logAudit } from '@/modules/audit';
import { logger } from '@/lib/utils/logger';
import type { Json } from '@/types/prisma-json';
import { prisma, isLineConfigured } from '@/lib';

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    // ── Auth: ADMIN or STAFF only ─────────────────────────────────────────────
    const session = requireRole(req, ['ADMIN', 'STAFF']);
    const actorId = session.sub;
    const actorRole = session.role;

    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const input = sendInvoiceSchema.parse(body);

    const invoiceService = getInvoiceService();
    const invoice = await invoiceService.markInvoiceSent(id, input);

    const invoiceContext = await prisma.invoice.findUnique({
      where: { id },
      include: {
        room: {
          include: {
            roomTenants: {
              where: { role: 'PRIMARY', moveOutDate: null },
              include: { tenant: true },
              take: 1,
            },
          },
        },
      },
    });

    const primaryTenant = invoiceContext?.room?.roomTenants?.[0]?.tenant || null;
    const lineUserId = primaryTenant?.lineUserId || null;
    const lineConfigured = isLineConfigured();

    if (!lineConfigured) {
      logger.warn({
        type: 'invoice_send_line_not_configured',
        invoiceId: id,
        actorId,
      });
    }

    const initialStatus = lineConfigured && lineUserId ? 'PENDING' : 'FAILED';
    const initialError = !lineConfigured
      ? 'LINE is not configured'
      : !lineUserId
        ? 'No LINE account linked to the tenant'
        : null;

    // ── Resolve the active DocumentTemplate for INVOICE type ─────────────────
    // Capture a snapshot (templateId + body hash) so we can prove which template
    // was active at delivery creation time, even if the template is edited later.
    let docTemplate: { id: string; body: string } | null = null;
    try {
      docTemplate = await prisma.documentTemplate.findFirst({
        where: { type: 'INVOICE' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, body: true },
      });
    } catch {
      // Non-blocking — proceed without template snapshot
    }
    const documentTemplateId = docTemplate?.id ?? null;
    const documentTemplateHash = docTemplate?.body
      ? createHash('sha256').update(docTemplate.body).digest('hex')
      : null;

    let deliveryId: string | null = null;
    try {
      const delivery = await prisma.invoiceDelivery.create({
        data: {
          invoiceId: id,
          channel: (input.channel as 'LINE' | 'PDF' | 'PRINT') ?? 'LINE',
          status: initialStatus,
          recipientRef: lineUserId,
          errorMessage: initialError,
          createdBy: actorId,
          // Snapshot of which DocumentTemplate was active at send time.
          // Template edits after this point do NOT change these fields.
          ...(documentTemplateId ? { documentTemplateId } : {}),
          ...(documentTemplateHash ? { documentTemplateHash } : {}),
        },
      });
      deliveryId = delivery.id;
    } catch {
      // Non-blocking
    }

    let templateBody: string | null = null;
    let resolvedTemplateId: string | null = null;
    try {
      const msgTemplate = input.templateId
        ? await prisma.messageTemplate.findUnique({ where: { id: input.templateId } })
        : await prisma.messageTemplate.findFirst({
            where: { type: 'INVOICE_SEND' },
            orderBy: { updatedAt: 'desc' },
          });
      if (msgTemplate) {
        templateBody = msgTemplate.body;
        resolvedTemplateId = msgTemplate.id;
      }
    } catch {
      // Non-blocking
    }

    const baseUrl = process.env.APP_BASE_URL || '';
    const link = `${baseUrl}/api/invoices/${encodeURIComponent(id)}/pdf`;

    if (lineConfigured && lineUserId) {
      const processor = getOutboxProcessor();
      await processor.writeOne(
        'Invoice',
        id,
        'InvoiceSendRequested',
        {
          invoiceId: id,
          deliveryId,
          lineUserId,
          pdfUrl: link,
          roomId: invoice.room?.id,
          roomNumber: invoice.room?.roomNumber,
          totalAmount: invoice.totalAmount,
          dueDate: invoice.dueDate?.toISOString?.() ?? null,
          templateId: resolvedTemplateId,
          templateBody,
          lineConfigured,
        } as unknown as Json,
      );
    }

    await logAudit({
      actorId,
      actorRole,
      action: 'INVOICE_SEND_REQUESTED',
      entityType: 'INVOICE',
      entityId: id,
      metadata: {
        pdfUrl: link,
        messageTemplateId: resolvedTemplateId,
        documentTemplateId,
        documentTemplateHash,
        lineConfigured,
        deliveryStatus: initialStatus,
        // Note: lineUserId intentionally omitted from audit to avoid PII in logs.
        hasLineRecipient: lineUserId !== null,
      },
    });

    logger.info({
      type: 'invoice_send_requested',
      invoiceId: id,
      actorId,
      messageTemplateId: resolvedTemplateId,
      documentTemplateId,
      lineConfigured,
      hasLineRecipient: lineUserId !== null,
      deliveryStatus: initialStatus,
      deliveryId,
    });

    return NextResponse.json({
      success: true,
      data: invoice,
      message: lineConfigured && lineUserId
        ? 'Invoice queued for LINE delivery'
        : 'Invoice marked as sent, but LINE delivery could not be queued automatically',
      meta: {
        lineConfigured,
        hasLineRecipient: lineUserId !== null,
        deliveryStatus: initialStatus,
        messageTemplateId: resolvedTemplateId,
        documentTemplateId,
        deliveryId,
        // lineUserId intentionally excluded — PII; use deliveryId to look up
        // recipient details in the admin delivery record if needed.
      },
    } as ApiResponse<typeof invoice>);
  },
);
