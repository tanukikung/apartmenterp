import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { sendInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { getOutboxProcessor } from '@/lib/outbox';
import { logAudit } from '@/modules/audit';
import { logger } from '@/lib/utils/logger';
import type { Json } from '@/types/prisma-json';
import { prisma, isLineConfigured } from '@/lib';

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
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
      logger.warn({ type: 'invoice_send_line_not_configured', invoiceId: id });
    }

    const initialStatus = lineConfigured && lineUserId ? 'PENDING' : 'FAILED';
    const initialError = !lineConfigured
      ? 'LINE is not configured'
      : !lineUserId
        ? 'No LINE account linked to the tenant'
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
          createdBy: 'system',
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
      actorId: 'system',
      actorRole: 'ADMIN',
      action: 'INVOICE_SEND_REQUESTED',
      entityType: 'INVOICE',
      entityId: id,
      metadata: {
        pdfUrl: link,
        templateId: resolvedTemplateId,
        lineConfigured,
        deliveryStatus: initialStatus,
        lineUserId,
      },
    });

    logger.info({
      type: 'invoice_sent_api',
      invoiceId: id,
      templateId: resolvedTemplateId,
      lineConfigured,
      lineUserId,
      deliveryStatus: initialStatus,
    });

    return NextResponse.json({
      success: true,
      data: invoice,
      message: lineConfigured && lineUserId
        ? 'Invoice queued for LINE delivery'
        : 'Invoice marked as sent, but LINE delivery could not be queued automatically',
      meta: {
        lineConfigured,
        deliveryStatus: initialStatus,
        templateId: resolvedTemplateId,
        deliveryId,
        lineUserId,
      },
    } as ApiResponse<typeof invoice>);
  },
);
