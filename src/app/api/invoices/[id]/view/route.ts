import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole } from '@/lib/auth/guards';

// ============================================================================
// POST /api/invoices/[id]/view - Mark invoice as viewed
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    requireRole(req, ['ADMIN', 'STAFF']);

    const { invoiceService } = getServiceContainer();
    const invoice = await invoiceService.markInvoiceViewed(id);

    logger.info({
      type: 'invoice_viewed_api',
      invoiceId: id,
    });

    return NextResponse.json({
      success: true,
      data: invoice,
      message: 'Invoice marked as viewed',
    } as ApiResponse<typeof invoice>);
  }
);
