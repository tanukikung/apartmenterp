import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { updateMoveOutItemSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; itemId: string };
}

// ============================================================================
// PATCH /api/moveouts/[id]/items/[itemId] - Update inspection item
// ============================================================================

export const PATCH = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`moveouts-item-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
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
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`moveouts-item-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

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
