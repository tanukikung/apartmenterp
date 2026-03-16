import { NextRequest, NextResponse } from 'next/server';
import { getBillingService } from '@/modules/billing/billing.service';
import { addBillingItemSchema } from '@/modules/billing/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/billing/[id]/items - Add billing item
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id: billingRecordId } = params;
    const body = await req.json();

    const input = addBillingItemSchema.parse(body);

    const billingService = getBillingService();
    const item = await billingService.addBillingItem(billingRecordId, input);

    logger.info({
      type: 'billing_item_added_api',
      billingRecordId,
      itemId: item.id,
      typeCode: item.typeCode,
    });

    return NextResponse.json({
      success: true,
      data: item,
      message: 'Billing item added successfully',
    } as ApiResponse<typeof item>, { status: 201 });
  }
);
