import { NextRequest, NextResponse } from 'next/server';
import { getBillingService } from '@/modules/billing/billing.service';
import { updateBillingItemSchema } from '@/modules/billing/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// PATCH /api/billing/items/[itemId] - Update billing item
// ============================================================================

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { itemId: string } }): Promise<NextResponse> => {
    const { itemId } = params;
    const body = await req.json();

    const input = updateBillingItemSchema.parse(body);

    const billingService = getBillingService();
    const item = await billingService.updateBillingItem(itemId, input);

    logger.info({
      type: 'billing_item_updated_api',
      itemId,
      typeCode: item.typeCode,
    });

    return NextResponse.json({
      success: true,
      data: item,
      message: 'Billing item updated successfully',
    } as ApiResponse<typeof item>);
  }
);

// ============================================================================
// DELETE /api/billing/items/[itemId] - Remove billing item
// ============================================================================

export const DELETE = asyncHandler(
  async (req: NextRequest, { params }: { params: { itemId: string } }): Promise<NextResponse> => {
    const { itemId } = params;

    const billingService = getBillingService();
    await billingService.removeBillingItem(itemId);

    logger.info({
      type: 'billing_item_removed_api',
      itemId,
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: 'Billing item removed successfully',
    } as ApiResponse<null>);
  }
);
