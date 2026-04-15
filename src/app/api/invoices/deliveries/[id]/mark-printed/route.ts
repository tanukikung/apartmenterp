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

// PATCH /api/invoices/deliveries/[id]/mark-printed
// Marks a PRINT-channel InvoiceDelivery as physically printed. This is the
// confirmation step for the print queue — flipping status PENDING → SENT
// and stamping sentAt = now.

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN', 'STAFF']);
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
