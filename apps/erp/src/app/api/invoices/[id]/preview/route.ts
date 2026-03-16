import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const GET = asyncHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const invoiceService = getInvoiceService();
    const preview = await invoiceService.getInvoicePreview(id);
    return NextResponse.json({
      success: true,
      data: preview,
    } as ApiResponse<typeof preview>);
  }
);
