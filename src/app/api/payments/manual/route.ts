import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getVerifiedActor, requireAuthSession, requireRole } from '@/lib/auth/guards';
import { syncInvoicePaymentState } from '@/modules/payments/invoice-payment-state';
import { logAudit } from '@/modules/audit';

const ManualPaymentMethod = z.enum(['CASH', 'CHECK', 'TRANSFER']);
type ManualPaymentMethod = z.infer<typeof ManualPaymentMethod>;

const manualPaymentSchema = z.object({
  invoiceId: z.string().uuid('Invalid invoice ID'),
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: ManualPaymentMethod,
  paidAt: z.string().datetime({ message: 'Invalid date format' }).optional(),
  notes: z.string().optional(),
});

async function getInvoiceRemainingAmount(invoiceId: string): Promise<number> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { totalAmount: true, status: true },
  });
  if (!invoice) return 0;

  if (invoice.status === 'PAID') return 0;

  const totals = await prisma.payment.aggregate({
    where: {
      matchedInvoiceId: invoiceId,
      status: 'CONFIRMED',
    },
    _sum: { amount: true },
  });

  const totalPaid = Number(totals._sum.amount ?? 0);
  return Math.max(0, Number(invoice.totalAmount) - totalPaid);
}

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
  requireRole(req, ['ADMIN', 'STAFF']);
  const actor = getVerifiedActor(req);

  const body = await req.json().catch(() => ({}));
  const validation = manualPaymentSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: validation.error.errors[0]?.message ?? 'Invalid input',
          code: 'VALIDATION_ERROR',
          name: 'ValidationError',
          statusCode: 400,
        },
      },
      { status: 400 }
    );
  }

  const { invoiceId, amount, paymentMethod, paidAt, notes } = validation.data;
  const paymentDate = paidAt ? new Date(paidAt) : new Date();

  // Get invoice and check if already paid
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { room: true },
  });

  if (!invoice) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Invoice not found',
          code: 'NOT_FOUND',
          name: 'NotFoundError',
          statusCode: 404,
        },
      },
      { status: 404 }
    );
  }

  if (invoice.status === 'PAID') {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: 'Invoice is already paid',
          code: 'INVOICE_ALREADY_PAID',
          name: 'BadRequestError',
          statusCode: 400,
        },
      },
      { status: 400 }
    );
  }

  // Check remaining amount to detect overpayment
  const remainingAmount = await getInvoiceRemainingAmount(invoiceId);
  const isOverpayment = amount > remainingAmount;

  const result = await prisma.$transaction(async (tx) => {
    const paymentId = uuidv4();

    // Determine remark for overpayment
    const remark = isOverpayment
      ? `Manual payment overpayment: excess of ${(amount - remainingAmount).toFixed(2)} THB over remaining balance.`
      : notes ?? null;

    // Create the Payment record directly (not via PaymentTransaction)
    const payment = await tx.payment.create({
      data: {
        id: paymentId,
        amount,
        paidAt: paymentDate,
        description: paymentMethod, // Store CASH, CHECK, or TRANSFER as description
        reference: notes ?? null,
        sourceFile: 'MANUAL_ENTRY',
        status: 'CONFIRMED',
        matchedInvoiceId: invoiceId,
        confirmedAt: new Date(),
        confirmedBy: actor.actorId,
        remark,
      },
    });

    // Sync invoice payment state
    const paymentState = await syncInvoicePaymentState(tx, {
      invoiceId,
      paymentId: payment.id,
      paymentAmount: amount,
      paidAt: paymentDate,
    });

    return { payment, invoice: paymentState.invoice, settled: paymentState.settled, transitionedToPaid: paymentState.transitionedToPaid };
  });

  // Log audit
  await logAudit({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: 'PAYMENT_CONFIRMED',
    entityType: 'INVOICE',
    entityId: invoiceId,
    metadata: {
      paymentId: result.payment.id,
      amount,
      paymentMethod,
      isOverpayment,
      settled: result.settled,
    },
  });

  const message = result.transitionedToPaid
    ? 'Payment recorded and invoice settled'
    : isOverpayment
    ? 'Payment recorded (overpayment detected)'
    : 'Payment recorded';

  return NextResponse.json(
    {
      success: true,
      data: {
        payment: result.payment,
        invoice: result.invoice,
        settled: result.settled,
        transitionedToPaid: result.transitionedToPaid,
        isOverpayment,
        remainingAmount,
      },
      message,
    } as ApiResponse<unknown>,
    { status: 201 }
  );
});
