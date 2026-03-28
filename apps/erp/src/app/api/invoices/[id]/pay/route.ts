import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { payInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getServiceContainer } from '@/lib/service-container';

// ============================================================================
// POST /api/invoices/[id]/pay - Record a manual settlement payment
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN', 'STAFF']);
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    const input = payInvoiceSchema.parse(body);

    const { paymentService } = getServiceContainer();
    const result = await paymentService.settleOutstandingBalance(
      id,
      {
        paidAt: input.paidAt,
        referenceNumber: input.paymentId,
      },
      session.sub,
    );

    logger.info({
      type: 'invoice_paid_api',
      invoiceId: id,
      paymentId: result.payment.id,
      actorId: session.sub,
    });

    return NextResponse.json({
      success: true,
      data: result.invoice,
      message: result.settled ? 'Payment recorded and invoice settled' : 'Payment recorded',
    } as ApiResponse<typeof result.invoice>);
  }
);
