import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { createPaymentSchema, type CreatePaymentInput } from '@/modules/payments/types';
import { getPaymentService } from '@/modules/payments/payment.service';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') ?? '20'), 100);
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

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

  const input = createPaymentSchema.parse(body) as unknown as CreatePaymentInput;

  const svc = getPaymentService();
  const { payment, invoice } = await svc.createPayment(input);

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
    message: 'Payment recorded and invoice marked as paid',
  } as ApiResponse<unknown>, { status: 201 });
});
