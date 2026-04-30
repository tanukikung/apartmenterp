import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { payInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getServiceContainer } from '@/lib/service-container';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const PAYMENT_WINDOW_MS = 60 * 1000;
const PAYMENT_MAX_ATTEMPTS = 10;

// ============================================================================
// POST /api/invoices/[id]/pay - Record a manual settlement payment
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`invoice-pay:${ip}`, PAYMENT_MAX_ATTEMPTS, PAYMENT_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many payment requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
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
    const input = payInvoiceSchema.parse(body);

    const { paymentService } = getServiceContainer();
    const result = await paymentService.settleOutstandingBalance(
      id,
      {
        paidAt: input.paidAt,
        referenceNumber: input.paymentId,
      },
      session.sub,
    );

    logger.info({
      type: 'invoice_paid_api',
      invoiceId: id,
      paymentId: result.payment.id,
      actorId: session.sub,
    });

    return NextResponse.json({
      success: true,
      data: result.invoice,
      message: result.settled ? 'Payment recorded and invoice settled' : 'Payment recorded',
    } as ApiResponse<typeof result.invoice>);
  }
);
