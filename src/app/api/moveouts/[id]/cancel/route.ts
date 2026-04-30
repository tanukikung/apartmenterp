import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createMoveOutService } from '@/modules/moveouts';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

const cancelSchema = z.object({
  reason: z.string().optional(),
});

// ============================================================================
// POST /api/moveouts/[id]/cancel - Cancel move-out
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: RouteParams): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`moveouts-cancel:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const body = cancelSchema.parse(await req.json());
  const reason = body.reason;

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
