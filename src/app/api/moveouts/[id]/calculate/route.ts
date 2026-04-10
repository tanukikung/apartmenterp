import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { calculateDepositSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// POST /api/moveouts/[id]/calculate - Calculate deposit deductions
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json();

  const input = calculateDepositSchema.parse(body);

  const moveOutService = createMoveOutService();
  const moveOut = await moveOutService.calculateDeposit(params.id, input);

  logger.info({
    type: 'moveout_deposit_calculated_api',
    moveOutId: params.id,
    totalDeduction: moveOut.totalDeduction,
    finalRefund: moveOut.finalRefund,
  });

  return NextResponse.json({
    success: true,
    data: moveOut,
    message: 'Deposit calculated successfully',
  } as ApiResponse<typeof moveOut>);
});
