import { NextRequest, NextResponse } from 'next/server';
import { executeMonthlyDataImportBatch } from '@/modules/billing/monthly-data-import.service';
import { asyncHandler, type ApiResponse, ValidationError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { z } from 'zod';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const bodySchema = z.object({
  batchId: z.string().uuid(),
});

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`billing-monthly-import-execute:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many billing requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }

  const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('batchId is required and must be a valid UUID');
  }

  const { batchId } = parsed.data;
  const importedBy = session.username;

  const result = await executeMonthlyDataImportBatch(batchId, importedBy);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
