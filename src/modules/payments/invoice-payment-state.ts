import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
import { EventTypes } from '@/lib';
import { NotFoundError } from '@/lib/utils/errors';


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
  // Lock the row to prevent concurrent payments from causing TOCTOU race conditions.
  // This ensures only one payment can transition the invoice to PAID at a time.
  // Using raw query because Prisma.TransactionClient type doesn't expose `for: 'update'`.
  // $queryRaw returns an array — destructure to get the single row.
  type InvoiceRow = { id: string; status: string; totalAmount: Prisma.Decimal; paidAt: Date | null; lateFeeAmount: Prisma.Decimal | null };
  const [invoice] = await (tx as unknown as { $queryRaw: (strings: TemplateStringsArray, ...args: unknown[]) => Promise<InvoiceRow[]> }).$queryRaw`
    SELECT id, status, "totalAmount", "paidAt", "lateFeeAmount"
    FROM invoices
    WHERE id = ${input.invoiceId}
    FOR UPDATE
  `;

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
  const lateFeeAmount = Number(invoice.lateFeeAmount ?? 0);
  const totalOwed = invoiceTotal + lateFeeAmount;
  // Use epsilon comparison scaled to totalOwed to handle floating-point rounding
  const EPSILON = Math.max(0.01, totalOwed * 0.0001); // 0.01 minimum, or 0.01% of total
  const settled = Math.abs(totalPaid - totalOwed) <= EPSILON;
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
        },
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
