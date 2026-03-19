import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireAuthSession } from '@/lib/auth/guards';

// ============================================================================
// GET /api/invoices/[id] — Get invoice by ID (admin/staff only)
//
// Auth note: this endpoint returns structured JSON including line-item detail,
// version history, and delivery records — it is for the admin portal only.
// Tenant-facing PDF/view access uses signed expiring links or operator auth.
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireAuthSession(req);

    const { id } = params;
    const invoiceService = getInvoiceService();
    const invoice = await invoiceService.getInvoiceById(id);

    return NextResponse.json({
      success: true,
      data: invoice,
    } as ApiResponse<typeof invoice>);
  }
);
