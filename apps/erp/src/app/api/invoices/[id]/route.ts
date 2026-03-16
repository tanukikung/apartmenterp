import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';

// ============================================================================
// GET /api/invoices/[id] - Get invoice by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;

    const invoiceService = getInvoiceService();
    const invoice = await invoiceService.getInvoiceById(id);

    return NextResponse.json({
      success: true,
      data: invoice,
    } as ApiResponse<typeof invoice>);
  }
);
