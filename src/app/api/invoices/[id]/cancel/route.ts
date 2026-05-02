import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, BadRequestError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getServiceContainer } from '@/lib/service-container';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

/**
 * POST /api/invoices/[id]/cancel — Cancel an invoice (revert RoomBilling to LOCKED)
 *
 * Requires a reason (min 10 chars) to prevent silent invoice suppression fraud.
 * Only GENERATED/SENT/VIEWED invoices can be cancelled; PAID/OVERDUE_CANCELLED cannot.
 * Requires ADMIN or OWNER role.
 */
const CancelReasonCategory = z.enum(['ERROR', 'CUSTOMER_REQUEST', 'FRAUD', 'OTHER']);
type CancelReasonCategory = z.infer<typeof CancelReasonCategory>;

const cancelSchema = z.object({
  // Reason category required for audit trail and analytics
  cancelReasonCategory: CancelReasonCategory,
  // Reason is required to prevent a single admin from silently cancelling invoices
  // (which would make them disappear from overdue reports)
  reason: z.string().min(10, 'ต้องระบุเหตุผลอย่างน้อย 10 ตัวอักษร'),
});

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`invoice-cancel:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    const session = requireRole(req, ['ADMIN', 'OWNER']);
    const { id } = params;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
        { status: 400 }
      );
    }
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestError('ต้องระบุเหตุผลการยกเลิกอย่างน้อย 10 ตัวอักษร');
    }

    const { invoiceService } = getServiceContainer();
    const cancelled = await invoiceService.cancelInvoice(
      id,
      session.sub,
      parsed.data.reason,
      parsed.data.cancelReasonCategory,
    );

    logger.info({
      type: 'invoice_cancel_api',
      invoiceId: id,
      actorId: session.sub,
      reason: parsed.data.reason,
    });

    return NextResponse.json({
      success: true,
      data: cancelled,
      message: 'Invoice cancelled — RoomBilling has been unlocked for re-invoicing',
    } as ApiResponse<typeof cancelled>);
  }
);
