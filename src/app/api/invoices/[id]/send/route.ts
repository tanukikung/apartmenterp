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
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`invoice-send:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const actorId = session.sub;
    const actorRole = session.role;

    const { id } = params;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
        { status: 400 }
      );
    }
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
