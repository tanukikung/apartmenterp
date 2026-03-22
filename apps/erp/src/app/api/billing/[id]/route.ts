import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';

// ============================================================================
// GET /api/billing/[id] - Get billing record by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;

    const { billingService } = getServiceContainer();
    const record = await billingService.getBillingRecord(id);

    return NextResponse.json({
      success: true,
      data: record,
    } as ApiResponse<typeof record>);
  }
);