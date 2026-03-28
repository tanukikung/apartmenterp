import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import {
  ApiResponse,
  ConflictError,
  asyncHandler,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { getServiceContainer } from '@/lib/service-container';
import { sendInvoiceSchema } from '@/modules/invoices/types';

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN']);
    const actorId = session.sub;
    const actorRole = session.role;

    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const input = sendInvoiceSchema.parse(body);

    const { invoiceService } = getServiceContainer();
    const result = await invoiceService.sendInvoice(id, input, actorId);

    if (!result.queued) {
      if (!result.lineConfigured) {
        logger.warn({
          type: 'invoice_send_line_not_configured',
          invoiceId: id,
          actorId,
        });
      }

      await logAudit({
        actorId,
        actorRole,
        action: 'INVOICE_SEND_REQUESTED',
        entityType: 'INVOICE',
        entityId: id,
        metadata: {
          pdfUrl: result.pdfUrl,
          messageTemplateId: result.messageTemplateId,
          documentTemplateId: result.documentTemplateId,
          documentTemplateHash: result.documentTemplateHash,
          lineConfigured: result.lineConfigured,
          deliveryStatus: result.deliveryStatus,
          hasLineRecipient: result.hasLineRecipient,
          deliveryId: result.deliveryId,
        },
      });

      logger.warn({
        type: 'invoice_send_not_queueable',
        invoiceId: id,
        actorId,
        lineConfigured: result.lineConfigured,
        hasLineRecipient: result.hasLineRecipient,
        deliveryId: result.deliveryId,
      });

      throw new ConflictError(result.errorMessage ?? 'Invoice delivery could not be queued');
    }

    if (!result.invoice) {
      throw new ConflictError('Invoice delivery could not be queued');
    }

    await logAudit({
      actorId,
      actorRole,
      action: 'INVOICE_SEND_REQUESTED',
      entityType: 'INVOICE',
      entityId: id,
      metadata: {
        pdfUrl: result.pdfUrl,
        messageTemplateId: result.messageTemplateId,
        documentTemplateId: result.documentTemplateId,
        documentTemplateHash: result.documentTemplateHash,
        lineConfigured: result.lineConfigured,
        deliveryStatus: result.deliveryStatus,
        hasLineRecipient: result.hasLineRecipient,
        deliveryId: result.deliveryId,
      },
    });

    logger.info({
      type: 'invoice_send_requested',
      invoiceId: id,
      actorId,
      messageTemplateId: result.messageTemplateId,
      documentTemplateId: result.documentTemplateId,
      lineConfigured: result.lineConfigured,
      hasLineRecipient: result.hasLineRecipient,
      deliveryStatus: result.deliveryStatus,
      deliveryId: result.deliveryId,
    });

    return NextResponse.json({
      success: true,
      data: result.invoice,
      message: 'Invoice queued for LINE delivery',
      meta: {
        lineConfigured: result.lineConfigured,
        hasLineRecipient: result.hasLineRecipient,
        deliveryStatus: result.deliveryStatus,
        messageTemplateId: result.messageTemplateId,
        documentTemplateId: result.documentTemplateId,
        deliveryId: result.deliveryId,
      },
    } as ApiResponse<typeof result.invoice>);
  },
);
