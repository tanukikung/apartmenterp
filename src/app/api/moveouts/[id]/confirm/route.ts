import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { confirmMoveOutSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole, getVerifiedActor } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// POST /api/moveouts/[id]/confirm - Confirm move-out
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json().catch(() => ({}));
  const actor = getVerifiedActor(req);

  const input = confirmMoveOutSchema.parse(body);

  const moveOutService = createMoveOutService();
  const moveOut = await moveOutService.confirmMoveOut(params.id, input, actor.actorId);

  logger.info({
    type: 'moveout_confirmed_api',
    moveOutId: params.id,
    confirmedBy: actor.actorId,
  });

  return NextResponse.json({
    success: true,
    data: moveOut,
    message: 'Move-out confirmed successfully',
  } as ApiResponse<typeof moveOut>);
});
