import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// POST /api/moveouts/[id]/cancel - Cancel move-out
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json().catch(() => ({}));
  const reason = body.reason as string | undefined;

  const moveOutService = createMoveOutService();
  const moveOut = await moveOutService.cancelMoveOut(params.id, reason);

  logger.info({
    type: 'moveout_cancelled_api',
    moveOutId: params.id,
  });

  return NextResponse.json({
    success: true,
    data: moveOut,
    message: 'Move-out cancelled successfully',
  } as ApiResponse<typeof moveOut>);
});
