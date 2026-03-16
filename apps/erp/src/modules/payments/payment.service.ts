import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';
import { EventTypes } from '@/lib';
import type { CreatePaymentInput } from './types';
import { BadRequestError, NotFoundError, ConflictError } from '@/lib/utils/errors';
import type { Prisma } from '@prisma/client';
import { logAudit } from '@/modules/audit';
import { Json } from '@/types/prisma-json';

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
    const invoiceTotal = Number(invoice.total);
    if (input.amount < invoiceTotal) {
      throw new BadRequestError('Payment amount is less than invoice total');
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

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          paidAt,
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
            paymentId: payment.id,
            paidAt: paidAt.toISOString(),
            amount: input.amount,
          } as unknown as Json,
          retryCount: 0,
        },
      });

      return { payment, invoice: updatedInvoice };
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
}

let paymentServiceInstance: PaymentService | null = null;
export function getPaymentService(): PaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService();
  }
  return paymentServiceInstance;
}
