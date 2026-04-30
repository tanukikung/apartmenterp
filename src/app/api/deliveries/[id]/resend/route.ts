import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib';
import { logAudit } from '@/modules/audit';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`delivery-resend:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
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
      include: { invoice: true },
    });

    if (!delivery) {
      return NextResponse.json(
        { success: false, error: { message: 'Delivery not found' } },
        { status: 404 }
      );
    }

    // Reset status to PENDING for retry
    const updated = await prisma.invoiceDelivery.update({
      where: { id: params.id },
      data: {
        status: 'PENDING',
        errorMessage: null,
      },
    });

    await logAudit({
      actorId,
      actorRole,
      action: 'DELIVERY_RESEND_REQUESTED',
      entityType: 'INVOICE_DELIVERY',
      entityId: params.id,
      metadata: {
        invoiceId: delivery.invoiceId,
        channel: delivery.channel,
        previousStatus: delivery.status,
      },
    });

    logger.info({
      type: 'delivery_resend_requested',
      deliveryId: params.id,
      invoiceId: delivery.invoiceId,
      channel: delivery.channel,
      actorId,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Delivery queued for resend',
    } as ApiResponse<typeof updated>);
  },
);
