import { NextRequest, NextResponse } from 'next/server';
import { createMoveOutService } from '@/modules/moveouts';
import { confirmMoveOutSchema } from '@/modules/moveouts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole, getVerifiedActor } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

// ============================================================================
// POST /api/moveouts/[id]/confirm - Confirm move-out
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`moveouts-confirm:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
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
