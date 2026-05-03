import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';
import { PAYMENT_STATUS } from '@/lib/constants';
import type { CreatePaymentInput } from './types';
import { BadRequestError, NotFoundError, ConflictError } from '@/lib/utils/errors';
import type { Prisma } from '@prisma/client';
import { logAudit } from '@/modules/audit';
import { syncInvoicePaymentState } from './invoice-payment-state';

export class PaymentService {
  async createPayment(input: CreatePaymentInput, createdBy?: string) {
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

    // All validation and writes run inside a single transaction with FOR UPDATE.
    // Keeping checks outside was a TOCTOU: two concurrent calls could both pass
    // the PAID check before either committed, creating two Payment records for
    // the same invoice.
    const result = await prisma.$transaction(async (tx) => {
      // Duplicate reference check inside lock (no DB unique constraint on reference)
      if (input.referenceNumber) {
        const existing = await tx.payment.findFirst({
          where: { reference: input.referenceNumber },
        });
        if (existing) {
          throw new ConflictError('Duplicate payment reference');
        }
      }

      // Lock invoice row before any write
      type LockedInvoiceRow = { id: string; status: string; totalAmount: Prisma.Decimal };
      const rows = await tx.$queryRaw<LockedInvoiceRow[]>`
        SELECT id, status::text AS status, "totalAmount"
        FROM invoices
        WHERE id = ${input.invoiceId}
        FOR UPDATE
      `;
      const lockedInvoice = rows[0];
      if (!lockedInvoice) {
        throw new NotFoundError('Invoice', input.invoiceId);
      }
      if (lockedInvoice.status === 'PAID') {
        throw new BadRequestError('Invoice is already paid');
      }

      const paymentId = uuidv4();
      const paymentData: Prisma.PaymentCreateArgs['data'] = {
        id: paymentId,
        amount: input.amount,
        paidAt,
        description: input.method,
        reference: input.referenceNumber,
        sourceFile: 'manual',
        status: PAYMENT_STATUS.CONFIRMED,
        matchedInvoiceId: lockedInvoice.id,
        confirmedAt: new Date(),
        confirmedBy: createdBy || 'system',
      };

      const payment = await tx.payment.create({ data: paymentData });

      const paymentState = await syncInvoicePaymentState(tx, {
        invoiceId: lockedInvoice.id,
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
      // Raw SQL FOR UPDATE acquires a row-level lock so that two concurrent
      // settleOutstandingBalance calls on the same invoice cannot both pass
      // the PAID/outstanding checks before either transaction commits.
      // Prisma's findUnique does NOT support a native for:'update' option —
      // passing it is silently ignored at runtime, leaving the window open.
      type LockedRow = { id: string; status: string; totalAmount: Prisma.Decimal };
      const rows = await tx.$queryRaw<LockedRow[]>`
        SELECT id, status::text AS status, "totalAmount"
        FROM invoices
        WHERE id = ${invoiceId}
        FOR UPDATE
      `;
      const invoice = rows[0];

      if (!invoice) {
        throw new NotFoundError('Invoice', invoiceId);
      }

      const totals = await tx.payment.aggregate({
        where: {
          matchedInvoiceId: invoice.id,
          status: PAYMENT_STATUS.CONFIRMED,
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
        status: PAYMENT_STATUS.CONFIRMED,
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
