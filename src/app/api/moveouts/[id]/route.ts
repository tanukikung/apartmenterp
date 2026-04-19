import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { updateMoveOutSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// GET /api/moveouts/[id] - Get move-out by ID
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const moveOutService = createMoveOutService();
  const moveOut = await moveOutService.getMoveOutById(params.id);

  return NextResponse.json({
    success: true,
    data: moveOut,
  } as ApiResponse<typeof moveOut>);
});

// ============================================================================
// PATCH /api/moveouts/[id] - Update move-out
// ============================================================================

export const PATCH = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json();

  const input = updateMoveOutSchema.parse(body);

  const moveOutService = createMoveOutService();
  const moveOut = await moveOutService.updateMoveOut(params.id, input);

  logger.info({
    type: 'moveout_updated_api',
    moveOutId: moveOut.id,
  });

  return NextResponse.json({
    success: true,
    data: moveOut,
    message: 'Move-out updated successfully',
  } as ApiResponse<typeof moveOut>);
});

// ============================================================================
// DELETE /api/moveouts/[id] - Delete move-out
// ============================================================================

export const DELETE = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);

  const moveOutService = createMoveOutService();
  await moveOutService.deleteMoveOut(params.id);

  logger.info({
    type: 'moveout_deleted_api',
    moveOutId: params.id,
  });

  return NextResponse.json({
    success: true,
    message: 'Move-out deleted successfully',
  } as any as ApiResponse<null>);
});
