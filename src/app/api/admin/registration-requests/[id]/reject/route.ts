import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

const rejectSchema = z.object({
  reason: z.string().max(250).optional(),
});

export const POST = asyncHandler(async (req: NextRequest, context?: { params: { id: string } }): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`registration-reject:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  const requestId = context?.params.id;
  if (!requestId) {
    throw new NotFoundError('StaffRegistrationRequest');
  }

  const registrationRequest = await prisma.staffRegistrationRequest.findUnique({
    where: { id: requestId },
  });

  if (!registrationRequest || registrationRequest.status !== 'PENDING') {
    throw new NotFoundError('StaffRegistrationRequest', requestId);
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
  const parsed = rejectSchema.parse(body);

  await prisma.staffRegistrationRequest.update({
    where: { id: registrationRequest.id },
    data: {
      status: 'REJECTED',
      reviewedById: session.sub,
      reviewedAt: new Date(),
      rejectReason: parsed.reason?.trim() || null,
    },
  });

  await logAudit({
    req,
    action: 'STAFF_REGISTRATION_REJECTED',
    entityType: 'StaffRegistrationRequest',
    entityId: registrationRequest.id,
    metadata: {
      username: registrationRequest.username,
      reason: parsed.reason?.trim() || null,
    },
  });

  return NextResponse.json({
    success: true,
    data: null,
    message: 'Staff registration rejected',
  } as ApiResponse<null>);
});
