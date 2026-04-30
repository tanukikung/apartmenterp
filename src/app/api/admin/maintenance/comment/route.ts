import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getVerifiedActor, requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getServiceContainer } from '@/lib/service-container';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

const schema = z.object({
  ticketId: z.string().uuid(),
  message: z.string().min(1),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`maintenance-comment:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
  const input = schema.parse(body);
  const actor = getVerifiedActor(req);
  requireRole(req, ['ADMIN', 'OWNER']);

  const { maintenanceService: service } = getServiceContainer();
  const comment = await service.addComment(
    {
      ticketId: input.ticketId,
      authorId: actor.actorId,
      message: input.message,
    },
    actor.actorId
  );

  return NextResponse.json({
    success: true,
    data: comment,
  } as ApiResponse<typeof comment>, { status: 201 });
});
