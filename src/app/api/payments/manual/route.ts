import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getVerifiedActor, requireRole } from '@/lib/auth/guards';
import { syncInvoicePaymentState } from '@/modules/payments/invoice-payment-state';
import { logAudit } from '@/modules/audit';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ManualPaymentMethod = z.enum(['CASH', 'CHECK', 'TRANSFER']);

const PAYMENT_WINDOW_MS = 60 * 1000;
const PAYMENT_MAX_ATTEMPTS = 10;

const manualPaymentSchema = z.object({
  invoiceId: z.string().uuid('Invalid invoice ID'),
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: ManualPaymentMethod,
  paidAt: z.string().datetime({ message: 'Invalid date format' }).optional(),
  notes: z.string().max(500).optional(),
});

function buildIdempotencyKey(req: NextRequest, actorId: string, payload: unknown): string {
  const headerKey = req.headers?.get?.('idempotency-key')?.trim();
  if (headerKey && headerKey.length <= 200) {
    return `manual-payment:${actorId}:${headerKey}`;
  }
  return `manual-payment:${actorId}:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function paymentError(message: string, code: string, statusCode: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { message, code, name: statusCode === 404 ? 'NotFoundError' : 'BadRequestError', statusCode } },
    { status: statusCode },
  );
}

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  const actor = getVerifiedActor(req);

  const limiter = getLoginRateLimiter();
  const ip = req.headers?.get?.('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const rateKey = `payments-manual:${session.sub}:${ip}`;
  const { allowed, remaining, resetAt } = await limiter.check(rateKey, PAYMENT_MAX_ATTEMPTS, PAYMENT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many payment requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return paymentError('Invalid JSON body', 'INVALID_JSON', 400);
  }

  const validation = manualPaymentSchema.safeParse(body);
  if (!validation.success) {
    return paymentError(validation.error.errors[0]?.message ?? 'Invalid input', 'VALIDATION_ERROR', 400);
  }

  const { invoiceId, amount, paymentMethod, paidAt, notes } = validation.data;
  const paymentDate = paidAt ? new Date(paidAt) : new Date();
  const idempotencyKey = buildIdempotencyKey(req, actor.actorId, {
    actorId: actor.actorId,
    invoiceId,
    amount,
    paymentMethod,
    paidAt: paymentDate.toISOString(),
    notes: notes ?? null,
  });

  let result: {
    payment: unknown;
    invoice: unknown;
    settled: boolean;
    transitionedToPaid: boolean;
    remainingAmount: number;
    idempotent: boolean;
  };

  try {
    result = await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({ where: { idempotencyKey } });
      if (existingPayment) {
        const existingInvoice = await tx.invoice.findUnique({
          where: { id: existingPayment.matchedInvoiceId ?? invoiceId },
          select: { id: true, status: true, totalAmount: true, paidAt: true },
        });
        return {
          payment: existingPayment,
          invoice: existingInvoice,
          settled: existingInvoice?.status === 'PAID',
          transitionedToPaid: false,
          remainingAmount: 0,
          idempotent: true,
        };
      }

      const [invoice] = await tx.$queryRaw<Array<{
        id: string;
        status: string;
        totalAmount: Prisma.Decimal;
        lateFeeAmount: Prisma.Decimal | null;
        paidAt: Date | null;
      }>>`
        SELECT "id", "status"::text, "totalAmount", "lateFeeAmount", "paidAt"
        FROM "invoices"
        WHERE "id" = ${invoiceId}
        FOR UPDATE OF "invoices"
      `;

      if (!invoice) throw new Error('INVOICE_NOT_FOUND');
      if (invoice.status === 'PAID' || invoice.paidAt) throw new Error('INVOICE_ALREADY_PAID');

      const totals = await tx.payment.aggregate({
        where: { matchedInvoiceId: invoiceId, status: 'CONFIRMED' },
        _sum: { amount: true },
      });
      const totalOwed = Number(invoice.totalAmount) + Number(invoice.lateFeeAmount ?? 0);
      const totalPaid = Number(totals._sum.amount ?? 0);
      const remainingAmount = Math.max(0, Number((totalOwed - totalPaid).toFixed(2)));

      if (amount > remainingAmount + 0.00001) {
        throw new Error(`PAYMENT_OVERPAYMENT:${remainingAmount}`);
      }

      const payment = await tx.payment.create({
        data: {
          id: uuidv4(),
          idempotencyKey,
          amount,
          paidAt: paymentDate,
          description: paymentMethod,
          reference: notes ?? null,
          sourceFile: 'MANUAL_ENTRY',
          status: 'CONFIRMED',
          matchedInvoiceId: invoiceId,
          confirmedAt: new Date(),
          confirmedBy: actor.actorId,
          remark: notes ?? null,
        },
      });

      const paymentState = await syncInvoicePaymentState(tx, {
        invoiceId,
        paymentId: payment.id,
        paymentAmount: amount,
        paidAt: paymentDate,
      });

      return {
        payment,
        invoice: paymentState.invoice,
        settled: paymentState.settled,
        transitionedToPaid: paymentState.transitionedToPaid,
        remainingAmount,
        idempotent: false,
      };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'INVOICE_NOT_FOUND') return paymentError('Invoice not found', 'NOT_FOUND', 404);
    if (message === 'INVOICE_ALREADY_PAID') return paymentError('Invoice is already paid', 'INVOICE_ALREADY_PAID', 400);
    if (message.startsWith('PAYMENT_OVERPAYMENT:')) {
      const remainingAmount = Number(message.split(':')[1] ?? 0);
      return paymentError(
        `Payment amount (${amount.toLocaleString()} THB) exceeds remaining balance (${remainingAmount.toLocaleString()} THB).`,
        'PAYMENT_OVERPAYMENT',
        400,
      );
    }
    throw error;
  }

  await logAudit({
    req,
    action: 'PAYMENT_CONFIRMED',
    entityType: 'INVOICE',
    entityId: invoiceId,
    metadata: {
      paymentId: (result.payment as { id?: string }).id,
      amount,
      paymentMethod,
      settled: result.settled,
      idempotent: result.idempotent,
    },
  });

  const message = result.transitionedToPaid
    ? 'Payment recorded and invoice settled'
    : result.idempotent
      ? 'Payment request already processed'
      : 'Payment recorded';

  return NextResponse.json(
    {
      success: true,
      data: {
        payment: result.payment,
        invoice: result.invoice,
        settled: result.settled,
        transitionedToPaid: result.transitionedToPaid,
        remainingAmount: result.remainingAmount,
        idempotent: result.idempotent,
      },
      message,
    } as ApiResponse<unknown>,
    { status: result.idempotent ? 200 : 201 },
  );
});
