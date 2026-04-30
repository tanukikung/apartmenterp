import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedActor, requireAuthSession, requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { createPaymentSchema, type CreatePaymentInput } from '@/modules/payments/types';
import { getServiceContainer } from '@/lib/service-container';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';
import { PaymentStatus } from '@prisma/client';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const VALID_PAYMENT_STATUSES: string[] = Object.values(PaymentStatus);

// Payment write operations: 10/min
const PAYMENT_WINDOW_MS = 60 * 1000;
const PAYMENT_MAX_ATTEMPTS = 10;

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const q = (searchParams.get('q') ?? '').trim().slice(0, 100);
  const rawSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
  const rawPage = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, 100) : 20;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (status) {
    if (!VALID_PAYMENT_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: { message: `Invalid status value: "${status}". Valid values are: ${VALID_PAYMENT_STATUSES.join(', ')}`, code: 'INVALID_STATUS', name: 'ValidationError', statusCode: 400 } },
        { status: 400 }
      );
    }
    where.status = status;
  }

  // Free-text search: description, reference, sourceFile, or exact id prefix.
  if (q) {
    where.OR = [
      { description: { contains: q, mode: 'insensitive' } },
      { reference: { contains: q, mode: 'insensitive' } },
      { sourceFile: { contains: q, mode: 'insensitive' } },
      { id: { startsWith: q } },
    ];
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip,
    }),
    prisma.payment.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: { data: payments, total, page, pageSize },
  } as ApiResponse<unknown>);
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`payments:${ip}`, PAYMENT_MAX_ATTEMPTS, PAYMENT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many payment requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
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
  const actor = getVerifiedActor(req);
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const input = createPaymentSchema.parse(body) as CreatePaymentInput;

  const { paymentService: svc } = getServiceContainer();
  const { payment, invoice, settled } = await svc.createPayment(input, actor.actorId);

  logger.info({
    type: 'payment_created',
    paymentId: payment.id,
    invoiceId: invoice.id,
    amount: input.amount,
    method: input.method,
  });

  return NextResponse.json({
    success: true,
    data: { payment, invoice },
    message: settled ? 'Payment recorded and invoice settled' : 'Payment recorded',
  } as ApiResponse<unknown>, { status: 201 });
});
