import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const { id } = params;
    const { invoiceService } = getServiceContainer();
    const preview = await invoiceService.getInvoicePreview(id);
    return NextResponse.json({
      success: true,
      data: preview,
    } as ApiResponse<typeof preview>);
  }
);
