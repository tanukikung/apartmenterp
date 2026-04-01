import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';
import type { CreatePaymentInput } from './types';
import { BadRequestError, NotFoundError, ConflictError } from '@/lib/utils/errors';
import type { Prisma } from '@prisma/client';
import { logAudit } from '@/modules/audit';
import { syncInvoicePaymentState } from './invoice-payment-state';

export class PaymentService {
  async createPayment(input: CreatePaymentInput, createdBy?: string) {
    if (input.referenceNumber) {
      const existing = await prisma.payment.findFirst({
        where: { reference: input.referenceNumber },
      });
      if (existing) {
        throw new ConflictError('Duplicate payment reference');
      }
    }
    const invoice = await prisma.invoice.findUnique({
      where: { id: input.invoiceId },
      include: { room: true },
    });
    if (!invoice) {
      throw new NotFoundError('Invoice', input.invoiceId);
    }
    if (invoice.status === 'PAID') {
      throw new BadRequestError('Invoice is already paid');
    }

    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      const paymentId = uuidv4();
      const paymentData: Prisma.PaymentCreateArgs['data'] = {
        id: paymentId,
        amount: input.amount,
        paidAt,
        description: input.method,
        reference: input.referenceNumber,
        sourceFile: 'manual',
        status: 'CONFIRMED',
        matchedInvoiceId: invoice.id,
        confirmedAt: new Date(),
        confirmedBy: createdBy || 'system',
      };

      const payment = await tx.payment.create({ data: paymentData });

      const paymentState = await syncInvoicePaymentState(tx, {
        invoiceId: invoice.id,
        paymentId: payment.id,
        paymentAmount: input.amount,
        paidAt,
      });

      return { payment, invoice: paymentState.invoice, settled: paymentState.settled };
    });

    await logAudit({
      actorId: createdBy || 'system',
      actorRole: 'ADMIN',
      action: 'PAYMENT_CONFIRMED',
      entityType: 'INVOICE',
      entityId: result.invoice.id,
      metadata: {
        paymentId: result.payment.id,
        amount: input.amount,
        method: input.method,
      },
    });

    return result;
  }

  async settleOutstandingBalance(
    invoiceId: string,
    input?: {
      paidAt?: string;
      referenceNumber?: string;
    },
    createdBy?: string,
  ) {
    const paidAt = input?.paidAt ? new Date(input.paidAt) : new Date();

    const result = await prisma.$transaction(async (tx) => {
      // FOR UPDATE prevents concurrent transactions from reading stale invoice state.
      // Without this lock, two simultaneous settleOutstandingBalance calls on the same
      // invoice could both pass the "PAID" check before either commits a payment.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma $transaction client type doesn't expose for:'update'
      const invoice = await (tx as any).invoice.findUnique({
        where: { id: invoiceId },
        include: { room: true },
        for: 'update',
      });

      if (!invoice) {
        throw new NotFoundError('Invoice', invoiceId);
      }

      const totals = await tx.payment.aggregate({
        where: {
          matchedInvoiceId: invoice.id,
          status: 'CONFIRMED',
        },
        _sum: { amount: true },
      });

      const totalPaid = Number(totals._sum.amount ?? 0);
      const outstanding = Number(invoice.totalAmount) - totalPaid;

      if (invoice.status === 'PAID' || outstanding <= 0.00001) {
        throw new BadRequestError('Invoice is already settled');
      }

      if (input?.referenceNumber) {
        const existing = await tx.payment.findFirst({
          where: { reference: input.referenceNumber },
        });
        if (existing) {
          throw new ConflictError('Duplicate payment reference');
        }
      }

      const paymentAmount = Number(outstanding.toFixed(2));
      const paymentId = uuidv4();
      const paymentData: Prisma.PaymentCreateArgs['data'] = {
        id: paymentId,
        amount: paymentAmount,
        paidAt,
        description: 'MANUAL_INVOICE_SETTLEMENT',
        reference: input?.referenceNumber,
        sourceFile: 'manual',
        status: 'CONFIRMED',
        matchedInvoiceId: invoice.id,
        confirmedAt: new Date(),
        confirmedBy: createdBy || 'system',
      };

      const payment = await tx.payment.create({ data: paymentData });
      const paymentState = await syncInvoicePaymentState(tx, {
        invoiceId: invoice.id,
        paymentId: payment.id,
        paymentAmount,
        paidAt,
      });

      return {
        payment,
        invoice: paymentState.invoice,
        settled: paymentState.settled,
        amount: paymentAmount,
      };
    });

    await logAudit({
      actorId: createdBy || 'system',
      actorRole: 'ADMIN',
      action: 'PAYMENT_CONFIRMED',
      entityType: 'INVOICE',
      entityId: result.invoice.id,
      metadata: {
        paymentId: result.payment.id,
        amount: result.amount,
        method: 'MANUAL_INVOICE_SETTLEMENT',
      },
    });

    return result;
  }
}

export function createPaymentService(): PaymentService {
  return new PaymentService();
}
