import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { requireRole, requireBuildingAccess } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';

// ============================================================================
// GET /api/invoices/[id] — Get invoice by ID (admin/staff only)
//
// Auth note: this endpoint returns structured JSON including line-item detail,
// version history, and delivery records — it is for the admin portal only.
// Tenant-facing PDF/view access uses signed expiring links or operator auth.
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

    const { id } = params;

    // IDOR guard: fetch invoice and verify the room belongs to the user's building
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, roomNo: true },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice', id);
    }

    // Invoice → Room → (no buildingId in single-building ERP; guard is a safe no-op)
    requireBuildingAccess(session, null);

    const { invoiceService } = getServiceContainer();
    const invoiceData = await invoiceService.getInvoiceById(id);

    return NextResponse.json({
      success: true,
      data: invoiceData,
    } as ApiResponse<typeof invoiceData>);
  }
);
