import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { z } from 'zod';

const PAYMENT_WINDOW_MS = 60 * 1000;
const PAYMENT_MAX_ATTEMPTS = 10;

const confirmMatchSchema = z.object({
  transactionId: z.string(),
  invoiceId: z.string(),
});

export const POST = asyncHandler(async (request: NextRequest): Promise<NextResponse> => {
  const session = requireRole(request, ['ADMIN', 'OWNER']);
  const userId = session.sub;

  const limiter = getLoginRateLimiter();
  const ip = request.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const key = `payments-match-confirm:${userId}:${ip}`;
  const { allowed, remaining, resetAt } = await limiter.check(key, PAYMENT_MAX_ATTEMPTS, PAYMENT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many payment requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const body = await request.json();

  const validation = confirmMatchSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid request data', details: validation.error.errors },
      { status: 400 }
    );
  }

  const requestId = request.headers?.get?.('x-request-id') ?? undefined;
  const { transactionId, invoiceId } = validation.data;

  try {
    const service = getServiceContainer().paymentMatchingService;
    if (requestId) {
      await service.confirmMatch(transactionId, invoiceId, userId, requestId);
    } else {
      await service.confirmMatch(transactionId, invoiceId, userId);
    }

    return NextResponse.json({
      success: true,
      data: { message: 'Match confirmed successfully' },
    });
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('not found')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 }
      );
    }
    if (error instanceof Error && (
      error.message.includes('already') ||
      error.message.includes('Cannot') ||
      error.message.includes('Conflict') ||
      error.message.includes('overlap')
    )) {
      return NextResponse.json(
        { success: false, error: { message: error.message, code: 'PAYMENT_MATCH_REJECTED', statusCode: 409 } },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: { message: 'Failed to confirm match', code: 'PAYMENT_MATCH_CONFIRM_FAILED', statusCode: 500 } },
      { status: 500 }
    );
  }
});
