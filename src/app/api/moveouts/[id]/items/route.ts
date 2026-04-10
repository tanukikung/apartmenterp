import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { createMoveOutItemSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// POST /api/moveouts/[id]/items - Add inspection item
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json();

  const input = createMoveOutItemSchema.parse(body);

  const moveOutService = createMoveOutService();
  const item = await moveOutService.addItem(params.id, input);

  logger.info({
    type: 'moveout_item_added_api',
    moveOutId: params.id,
    itemId: item.id,
  });

  return NextResponse.json({
    success: true,
    data: item,
    message: 'Inspection item added successfully',
  } as ApiResponse<typeof item>, { status: 201 });
});
