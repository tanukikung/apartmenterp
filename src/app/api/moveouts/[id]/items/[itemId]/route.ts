import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { updateMoveOutItemSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; itemId: string };
}

// ============================================================================
// PATCH /api/moveouts/[id]/items/[itemId] - Update inspection item
// ============================================================================

export const PATCH = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json();

  const input = updateMoveOutItemSchema.parse(body);

  const moveOutService = createMoveOutService();
  const item = await moveOutService.updateItem(params.itemId, input);

  logger.info({
    type: 'moveout_item_updated_api',
    moveOutId: params.id,
    itemId: params.itemId,
  });

  return NextResponse.json({
    success: true,
    data: item,
    message: 'Inspection item updated successfully',
  } as ApiResponse<typeof item>);
});

// ============================================================================
// DELETE /api/moveouts/[id]/items/[itemId] - Delete inspection item
// ============================================================================

export const DELETE = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const moveOutService = createMoveOutService();
  await moveOutService.deleteItem(params.itemId);

  logger.info({
    type: 'moveout_item_deleted_api',
    moveOutId: params.id,
    itemId: params.itemId,
  });

  return NextResponse.json({
    success: true,
    data: null,
    message: 'Inspection item deleted successfully',
  } as ApiResponse<null>);
});
