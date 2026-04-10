import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import {
  createMoveOutSchema,
  listMoveOutsQuerySchema,
} from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/moveouts - List all move-outs
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url);

  const query = {
    contractId: url.searchParams.get('contractId') || undefined,
    roomNo: url.searchParams.get('roomNo') || undefined,
    status: url.searchParams.get('status') || undefined,
    fromDate: url.searchParams.get('fromDate') || undefined,
    toDate: url.searchParams.get('toDate') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '20',
    sortBy: url.searchParams.get('sortBy') || 'createdAt',
    sortOrder: url.searchParams.get('sortOrder') || 'desc',
  };

  const validatedQuery = listMoveOutsQuerySchema.parse(query);

  const moveOutService = createMoveOutService();
  const result = await moveOutService.listMoveOuts(validatedQuery);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// ============================================================================
// POST /api/moveouts - Create a new move-out
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json();

  const input = createMoveOutSchema.parse(body);

  const moveOutService = createMoveOutService();
  const moveOut = await moveOutService.createMoveOut(input);

  logger.info({
    type: 'moveout_created_api',
    moveOutId: moveOut.id,
    contractId: moveOut.contractId,
  });

  return NextResponse.json({
    success: true,
    data: moveOut,
    message: 'Move-out record created successfully',
  } as ApiResponse<typeof moveOut>, { status: 201 });
});
