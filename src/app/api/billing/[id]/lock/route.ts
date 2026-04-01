import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { lockBillingSchema } from '@/modules/billing/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/billing/[id]/lock - Lock billing record
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id: billingRecordId } = params;
    const body = await req.json().catch(() => ({}));
    const session = requireRole(req, ['ADMIN']);

    const input = lockBillingSchema.parse(body);

    const { billingService } = getServiceContainer();
    const record = await billingService.lockBillingRecord(billingRecordId, input, session.sub);

    logger.info({
      type: 'billing_locked_api',
      billingRecordId,
      status: record.status,
    });

    return NextResponse.json({
      success: true,
      data: record,
      message: 'Billing record locked successfully',
    } as ApiResponse<typeof record>);
  }
);
