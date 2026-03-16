import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { payInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/invoices/[id]/pay - Mark invoice as paid
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json().catch(() => ({}));
    
    const input = payInvoiceSchema.parse(body);

    const invoiceService = getInvoiceService();
    const invoice = await invoiceService.markInvoicePaid(id, input);

    logger.info({
      type: 'invoice_paid_api',
      invoiceId: id,
    });

    return NextResponse.json({
      success: true,
      data: invoice,
      message: 'Invoice marked as paid',
    } as ApiResponse<typeof invoice>);
  }
);
