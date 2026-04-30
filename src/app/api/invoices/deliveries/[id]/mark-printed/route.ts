import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import {
  ApiResponse,
  BadRequestError,
  NotFoundError,
  asyncHandler,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// PATCH /api/invoices/deliveries/[id]/mark-printed
// Marks a PRINT-channel InvoiceDelivery as physically printed. This is the
// confirmation step for the print queue — flipping status PENDING → SENT
// and stamping sentAt = now.

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`invoice-mark-printed:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const actorId = session.sub;
    const actorRole = session.role;

    const delivery = await prisma.invoiceDelivery.findUnique({
      where: { id: params.id },
    });

    if (!delivery) {
      throw new NotFoundError('InvoiceDelivery', params.id);
    }
    if (delivery.channel !== 'PRINT') {
      throw new BadRequestError('Only PRINT-channel deliveries can be marked as printed');
    }
    if (delivery.status === 'SENT') {
      // Idempotent: already printed — return as-is.
      return NextResponse.json({
        success: true,
        data: { deliveryId: delivery.id, status: delivery.status },
      } as ApiResponse<{ deliveryId: string; status: string }>);
    }
    if (delivery.status !== 'PENDING') {
      throw new BadRequestError(
        `Cannot mark delivery as printed from status ${delivery.status}`,
      );
    }

    const now = new Date();
    const updated = await prisma.invoiceDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'SENT',
        sentAt: now,
        errorMessage: null,
      },
    });

    await logAudit({
      actorId,
      actorRole,
      action: 'INVOICE_PRINT_COMPLETED',
      entityType: 'INVOICE_DELIVERY',
      entityId: delivery.id,
      metadata: {
        invoiceId: delivery.invoiceId,
        channel: delivery.channel,
        printedAt: now.toISOString(),
      },
    });

    logger.info({
      type: 'invoice_print_completed',
      deliveryId: delivery.id,
      invoiceId: delivery.invoiceId,
      actorId,
    });

    return NextResponse.json({
      success: true,
      data: {
        deliveryId: updated.id,
        status: updated.status,
        sentAt: updated.sentAt?.toISOString() ?? null,
      },
    } as ApiResponse<{ deliveryId: string; status: string; sentAt: string | null }>);
  },
);
