import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedActor, requireAuthSession, requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { createPaymentSchema, type CreatePaymentInput } from '@/modules/payments/types';
import { getServiceContainer } from '@/lib/service-container';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';
import { PaymentStatus } from '@prisma/client';

const VALID_PAYMENT_STATUSES: string[] = Object.values(PaymentStatus);

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') ?? '20'), 100);
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1);
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
  const body = await req.json().catch(() => ({}));
  const actor = getVerifiedActor(req);
  requireRole(req, ['ADMIN', 'STAFF']);

  const input = createPaymentSchema.parse(body) as unknown as CreatePaymentInput;

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
