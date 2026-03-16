import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/invoices/[id]/view - Mark invoice as viewed
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;

    const invoiceService = getInvoiceService();
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
