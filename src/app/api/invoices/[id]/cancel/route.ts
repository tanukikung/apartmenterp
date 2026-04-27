import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, BadRequestError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getServiceContainer } from '@/lib/service-container';

/**
 * POST /api/invoices/[id]/cancel — Cancel an invoice (revert RoomBilling to LOCKED)
 *
 * Requires a reason (min 10 chars) to prevent silent invoice suppression fraud.
 * Only GENERATED/SENT/VIEWED invoices can be cancelled; PAID/OVERDUE_CANCELLED cannot.
 */
const cancelSchema = z.object({
  // Reason is required to prevent a single admin from silently cancelling invoices
  // (which would make them disappear from overdue reports)
  reason: z.string().min(10, 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร'),
});

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN']);
    const { id } = params;

    const body = await req.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError('ต้องระบุเหตุผลการยกเลิกอย่างน้อย 10 ตัวอักษร');
    }

    const { invoiceService } = getServiceContainer();
    const cancelled = await invoiceService.cancelInvoice(id, session.sub, parsed.data.reason);

    logger.info({
      type: 'invoice_cancel_api',
      invoiceId: id,
      actorId: session.sub,
      reason: parsed.data.reason,
    });

    return NextResponse.json({
      success: true,
      data: cancelled,
      message: 'Invoice cancelled — RoomBilling has been unlocked for re-invoicing',
    } as ApiResponse<typeof cancelled>);
  }
);
