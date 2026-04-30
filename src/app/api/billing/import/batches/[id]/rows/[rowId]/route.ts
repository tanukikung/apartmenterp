import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { updateBillingImportBatchRow } from '@/modules/billing/import-batch.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  roomNumber: z.string().trim().min(1).optional(),
  rentAmount: z.number().min(0).nullable().optional(),
  waterAmount: z.number().min(0).nullable().optional(),
  electricAmount: z.number().min(0).nullable().optional(),
  furnitureAmount: z.number().min(0).nullable().optional(),
  otherAmount: z.number().min(0).nullable().optional(),
  totalAmount: z.number().min(0).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const PATCH = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string; rowId: string } },
  ): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`billing-import-row-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Validation failed',
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const result = await updateBillingImportBatchRow(params.id, params.rowId, parsed.data);

    return NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<typeof result>);
  },
);
