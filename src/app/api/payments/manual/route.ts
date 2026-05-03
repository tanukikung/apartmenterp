import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';
import { asyncHandler, type ApiResponse, BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { getVerifiedActor, requireAuthSession, requireRole } from '@/lib/auth/guards';
import { syncInvoicePaymentState } from '@/modules/payments/invoice-payment-state';
import { logAudit } from '@/modules/audit';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { IdempotencyGuard } from '@/lib/middleware/idempotency';

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

function paymentError(message: string, code: string, statusCode: number): NextResponse {
  return NextResponse.json(
    { success: false, error: { message, code, name: statusCode === 404 ? 'NotFoundError' : 'BadRequestError', statusCode } },
    { status: statusCode },
  );
}

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
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

  // Idempotency: if the client retries with the same Idempotency-Key header,
  // return the stored response without re-executing the payment logic.
  const idempotency = new IdempotencyGuard(req);
  const cached = await idempotency.check();
  if (cached) return cached;

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

  // All checks and writes run inside a single transaction with FOR UPDATE so
  // two concurrent calls cannot both pass the PAID/overpayment guards and then
  // both commit a Payment record. The row lock serialises concurrent callers:
  // the second one sees the committed state of the first before it does anything.
  type LockedInvoiceRow = { id: string; status: string; totalAmount: Prisma.Decimal; lateFeeAmount: Prisma.Decimal | null };
  let remainingAmount = 0;

  const result = await prisma.$transaction(async (tx) => {
    // Lock the invoice row before any reads or writes.
    const rows = await tx.$queryRaw<LockedInvoiceRow[]>`
      SELECT id, status::text AS status, "totalAmount", "lateFeeAmount"
      FROM invoices
      WHERE id = ${invoiceId}
      FOR UPDATE
    `;
    const invoice = rows[0];

    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestError('Invoice is already paid');
    }

    if (invoice.status === 'CANCELLED') {
      throw new BadRequestError('Cannot record payment for a cancelled invoice');
    }

    // Compute remaining inside the lock so concurrent calls see the real balance.
    const totals = await tx.payment.aggregate({
      where: { matchedInvoiceId: invoiceId, status: 'CONFIRMED' },
      _sum: { amount: true },
    });
    const totalOwed = Number(invoice.totalAmount) + Number(invoice.lateFeeAmount ?? 0);
    const totalPaid = Number(totals._sum.amount ?? 0);
    remainingAmount = Math.max(0, Number((totalOwed - totalPaid).toFixed(2)));

    if (amount > remainingAmount + 0.001) {
      throw new BadRequestError(
        `จำนวนเงินชำระ (${amount.toLocaleString()} บาท) เกินยอดค้างชำระ (${remainingAmount.toLocaleString()} บาท) กรุณาตรวจสอบจำนวนเงินและลองใหม่`
      );
    }

    const paymentId = uuidv4();

    // Create the Payment record directly (not via PaymentTransaction)
    const payment = await tx.payment.create({
      data: {
        id: paymentId,
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

    // Sync invoice payment state (also uses FOR UPDATE internally — safe, same tx)
    const paymentState = await syncInvoicePaymentState(tx, {
      invoiceId,
      paymentId: payment.id,
      paymentAmount: amount,
      paidAt: paymentDate,
    });

    // ── Idempotency store INSIDE the transaction ─────────────────────────────
    // Storing inside the tx eliminates the crash window between "tx commits"
    // and "idempotency.store() is called outside". If the process dies after
    // this tx commits, a retry with the same Idempotency-Key will find the
    // stored record and replay the 201 — not see a misleading 400.
    const txResponseBody = {
      success: true,
      data: {
        payment: { id: payment.id, amount: payment.amount, status: payment.status, paidAt: payment.paidAt },
        invoice: paymentState.invoice,
        settled: paymentState.settled,
        transitionedToPaid: paymentState.transitionedToPaid,
        remainingAmount: Math.max(0, remainingAmount - amount),
      },
      message: paymentState.transitionedToPaid ? 'Payment recorded and invoice settled' : 'Payment recorded',
    };
    await idempotency.storeInTx(tx, txResponseBody, 201);

    return { payment, invoice: paymentState.invoice, settled: paymentState.settled, transitionedToPaid: paymentState.transitionedToPaid };
  });

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
    },
  });

  const message = result.transitionedToPaid
    ? 'Payment recorded and invoice settled'
    : 'Payment recorded';

  const responseBody = {
    success: true,
    data: {
      payment: result.payment,
      invoice: result.invoice,
      settled: result.settled,
      transitionedToPaid: result.transitionedToPaid,
      remainingAmount,
    },
    message,
  } as ApiResponse<unknown>;

  // idempotency.store() was moved INSIDE the $transaction above (storeInTx).
  // No separate store call is needed here — the idempotency key is committed
  // atomically with the payment, eliminating the crash window between
  // "tx commits" and "store() is called outside".

  return NextResponse.json(responseBody, { status: 201 });
});
