import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
import { EventTypes } from '@/lib';
import { NotFoundError } from '@/lib/utils/errors';
import type { Json } from '@/types/prisma-json';

type InvoicePaymentSnapshot = {
  id: string;
  status: string;
  totalAmount: unknown;
  paidAt: Date | null;
};

export interface SyncInvoicePaymentStateInput {
  invoiceId: string;
  paymentId: string;
  paymentAmount: number;
  paidAt: Date;
}

export interface SyncInvoicePaymentStateResult {
  invoice: InvoicePaymentSnapshot;
  settled: boolean;
  totalPaid: number;
  transitionedToPaid: boolean;
}

export async function syncInvoicePaymentState(
  tx: Prisma.TransactionClient,
  input: SyncInvoicePaymentStateInput,
): Promise<SyncInvoicePaymentStateResult> {
  const invoice = await tx.invoice.findUnique({
    where: { id: input.invoiceId },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      paidAt: true,
    },
  });

  if (!invoice) {
    throw new NotFoundError('Invoice', input.invoiceId);
  }

  const totals = await tx.payment.aggregate({
    where: {
      matchedInvoiceId: input.invoiceId,
      status: 'CONFIRMED',
    },
    _sum: { amount: true },
    _max: { paidAt: true },
  });

  const totalPaid = Number(totals._sum.amount ?? 0);
  const invoiceTotal = Number(invoice.totalAmount);
  const settled = totalPaid + 0.00001 >= invoiceTotal;
  const transitionedToPaid = settled && invoice.status !== 'PAID';

  let updatedInvoice: InvoicePaymentSnapshot = invoice;
  if (transitionedToPaid) {
    updatedInvoice = await tx.invoice.update({
      where: { id: input.invoiceId },
      data: {
        status: 'PAID',
        paidAt: totals._max.paidAt ?? input.paidAt,
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        paidAt: true,
      },
    });

    await tx.outboxEvent.create({
      data: {
        id: uuidv4(),
        aggregateType: 'Invoice',
        aggregateId: updatedInvoice.id,
        eventType: EventTypes.INVOICE_PAID,
        payload: {
          invoiceId: updatedInvoice.id,
          paymentId: input.paymentId,
          paidAt: (totals._max.paidAt ?? input.paidAt).toISOString(),
          amount: input.paymentAmount,
          totalPaid,
        } as unknown as Json,
        retryCount: 0,
      },
    });
  } else if (settled && !invoice.paidAt) {
    updatedInvoice = await tx.invoice.update({
      where: { id: input.invoiceId },
      data: {
        paidAt: totals._max.paidAt ?? input.paidAt,
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        paidAt: true,
      },
    });
  }

  return {
    invoice: updatedInvoice,
    settled,
    totalPaid,
    transitionedToPaid,
  };
}
