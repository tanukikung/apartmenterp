import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { markRefundSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole, getVerifiedActor } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// POST /api/moveouts/[id]/refund - Mark deposit as refunded
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json().catch(() => ({}));
  const actor = getVerifiedActor(req);

  const input = markRefundSchema.parse(body);

  const moveOutService = createMoveOutService();
  const moveOut = await moveOutService.markRefund(params.id, input, actor.actorId);

  logger.info({
    type: 'moveout_refunded_api',
    moveOutId: params.id,
    refundedBy: actor.actorId,
  });

  return NextResponse.json({
    success: true,
    data: moveOut,
    message: 'Deposit marked as refunded',
  } as ApiResponse<typeof moveOut>);
});
