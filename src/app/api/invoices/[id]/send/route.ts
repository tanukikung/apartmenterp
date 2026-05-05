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
import { rateLimitCritical, rateLimitTenant } from '@/lib/rate-limit/dual-layer-rate-limiter';
import { withIdempotency } from '@/lib/idempotency';
import { requireMutationsAllowed } from '@/lib/guards/system';
import { prisma } from '@/lib/db/client';

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const blocked = await requireMutationsAllowed();
    if (blocked) return blocked;

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    // Rate limiting always active in production.  In test environment the DB is
    // isolated so a generous limit is fine; the 20/min cap is too restrictive
    // for parallel E2E workers running many send calls in quick succession.
    if (process.env.NODE_ENV === 'test') {
      // Rate limit skipped in test mode
    } else {
      // Per-IP rate limit (defense-in-depth: prevents single client flooding)
      const { allowed: ipAllowed, remaining: ipRemaining, resetAt: ipResetAt } =
        await rateLimitCritical(`invoice-send:${ip}`, 20, 60_000);
      if (!ipAllowed) {
        return NextResponse.json(
          { success: false, error: { message: `Too many requests. Try again after ${ipResetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((ipResetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(ipRemaining), 'X-RateLimit-Limit': '20', 'X-RateLimit-Key': `invoice-send:${ip}` } }
        );
      }

      // Per-room rate limit: prevents one room's invoice sends from consuming
      // the shared rate limit budget for other rooms. Also caps per-room throughput.
      // We need the room number — fetch it cheaply from the invoice.
      const invoiceRoomCheck = await prisma.invoice.findUnique({
        where: { id: params.id },
        select: { roomNo: true },
      });
      if (invoiceRoomCheck) {
        const { allowed: roomAllowed, remaining: roomRemaining, resetAt: roomResetAt } =
          await rateLimitTenant(`invoice-send:room:${invoiceRoomCheck.roomNo}`, 20, 60_000);
        if (!roomAllowed) {
          return NextResponse.json(
            { success: false, error: { message: `Too many invoice sends for this room. Try again after ${roomResetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
            { status: 429, headers: { 'Retry-After': String(Math.ceil((roomResetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(roomRemaining), 'X-RateLimit-Limit': '20', 'X-RateLimit-Key': `invoice-send:room:${invoiceRoomCheck.roomNo}` } }
          );
        }
      }
    }

    const { id: invoiceId } = params;
    const session = await requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const actorId = session.sub;
    const actorRole = session.role;

    const idempotencyKey = `invoice_send:${invoiceId}`;

    const { result } = await withIdempotency(req, idempotencyKey, async () => {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        throw new ConflictError('Invalid JSON body');
      }
      const input = sendInvoiceSchema.parse(body);

      const requestId = req.headers.get('x-request-id') ?? undefined;
      const { invoiceService } = getServiceContainer();
      const sendResult = await invoiceService.sendInvoice(invoiceId, input, actorId, requestId);

      if (!sendResult.queued) {
        if (!sendResult.lineConfigured) {
          logger.warn({ type: 'invoice_send_line_not_configured', invoiceId, actorId });
        }
        await logAudit({
          actorId,
          actorRole,
          action: 'INVOICE_SEND_REQUESTED',
          entityType: 'INVOICE',
          entityId: invoiceId,
          metadata: {
            pdfUrl: sendResult.pdfUrl,
            messageTemplateId: sendResult.messageTemplateId,
            documentTemplateId: sendResult.documentTemplateId,
            lineConfigured: sendResult.lineConfigured,
            deliveryStatus: sendResult.deliveryStatus,
            hasLineRecipient: sendResult.hasLineRecipient,
            deliveryId: sendResult.deliveryId,
          },
        });
        logger.warn({ type: 'invoice_send_not_queueable', invoiceId, actorId, lineConfigured: sendResult.lineConfigured, hasLineRecipient: sendResult.hasLineRecipient, deliveryId: sendResult.deliveryId });
        throw new ConflictError(sendResult.errorMessage ?? 'Invoice delivery could not be queued');
      }

      if (!sendResult.invoice) {
        throw new ConflictError('Invoice delivery could not be queued');
      }

      await logAudit({
        actorId,
        actorRole,
        action: 'INVOICE_SEND_REQUESTED',
        entityType: 'INVOICE',
        entityId: invoiceId,
        metadata: {
          pdfUrl: sendResult.pdfUrl,
          messageTemplateId: sendResult.messageTemplateId,
          documentTemplateId: sendResult.documentTemplateId,
          lineConfigured: sendResult.lineConfigured,
          deliveryStatus: sendResult.deliveryStatus,
          hasLineRecipient: sendResult.hasLineRecipient,
          deliveryId: sendResult.deliveryId,
        },
      });

      logger.info({
        type: 'invoice_send_requested',
        invoiceId,
        actorId,
        messageTemplateId: sendResult.messageTemplateId,
        documentTemplateId: sendResult.documentTemplateId,
        lineConfigured: sendResult.lineConfigured,
        hasLineRecipient: sendResult.hasLineRecipient,
        deliveryStatus: sendResult.deliveryStatus,
        deliveryId: sendResult.deliveryId,
      });

      // Return a serializable response object (no Date, no BigInt)
      return {
        invoice: sendResult.invoice,
        lineConfigured: sendResult.lineConfigured,
        hasLineRecipient: sendResult.hasLineRecipient,
        deliveryStatus: sendResult.deliveryStatus,
        messageTemplateId: sendResult.messageTemplateId,
        documentTemplateId: sendResult.documentTemplateId,
        deliveryId: sendResult.deliveryId,
      };
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