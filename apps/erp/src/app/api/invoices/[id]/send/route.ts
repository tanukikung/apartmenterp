import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { sendInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { getOutboxProcessor } from '@/lib/outbox';
import { logAudit } from '@/modules/audit';
import { logger } from '@/lib/utils/logger';
import type { Json } from '@/types/prisma-json';

// ============================================================================
// POST /api/invoices/[id]/send - Mark invoice as sent
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    
    const input = sendInvoiceSchema.parse(body);

    const invoiceService = getInvoiceService();
    const invoice = await invoiceService.markInvoiceSent(id, input);

    // Record delivery attempt in invoice_deliveries
    try {
      const { prisma } = await import('@/lib');
      await prisma.invoiceDelivery.create({
        data: {
          invoiceId: id,
          channel: (input.channel as 'LINE' | 'PDF' | 'PRINT') ?? 'LINE',
          status: 'SENT',
          sentAt: new Date(),
          createdBy: 'system',
        },
      });
    } catch {
      // Non-blocking - delivery record failure should not fail the send
    }

    // ── MessageTemplate runtime lookup ───────────────────────────────────────
    // If templateId was supplied in the request body, use that record.
    // Otherwise fall back to the most-recently-updated INVOICE_SEND template so
    // outbox events always carry a rendered body when a template exists in DB.
    let templateBody: string | null = null;
    let resolvedTemplateId: string | null = null;
    try {
      const { prisma } = await import('@/lib');
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
    const processor = getOutboxProcessor();
    await processor.writeOne(
      'Invoice',
      id,
      'InvoiceSendRequested',
      {
        invoiceId: id,
        pdfUrl: link,
        roomId: invoice.room?.id,
        roomNumber: invoice.room?.roomNumber,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate?.toISOString?.() ?? null,
        // Template fields: outbox processor uses these to compose the LINE message.
        templateId: resolvedTemplateId,
        templateBody: templateBody,
      } as unknown as Json
    );

    await logAudit({
      actorId: 'system',
      actorRole: 'ADMIN',
      action: 'INVOICE_SEND_REQUESTED',
      entityType: 'INVOICE',
      entityId: id,
      metadata: { pdfUrl: link, templateId: resolvedTemplateId },
    });

    logger.info({
      type: 'invoice_sent_api',
      invoiceId: id,
      templateId: resolvedTemplateId,
    });

    return NextResponse.json({
      success: true,
      data: invoice,
      message: 'Invoice marked as sent',
    } as ApiResponse<typeof invoice>);
  }
);
