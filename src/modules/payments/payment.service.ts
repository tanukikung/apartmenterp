import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';
import { PAYMENT_STATUS } from '@/lib/constants';
import type { CreatePaymentInput } from './types';
import { BadRequestError, NotFoundError, ConflictError } from '@/lib/utils/errors';
import type { Prisma } from '@prisma/client';
import { logAudit } from '@/modules/audit';
import { logFinancialAudit } from '@/modules/financial-audit';
import { syncInvoicePaymentState } from './invoice-payment-state';
import { assertPaymentNotExceedingInvoiceTotal } from '@/lib/invariants/financial-guards';
import { logger } from '@/lib/utils/logger';
import { inc } from '@/lib/metrics/messaging';
import { versionedUpdate } from '@/lib/concurrency/version-guard';

export class PaymentService {
  async createPayment(input: CreatePaymentInput, createdBy?: string) {
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

    // All validation and writes run inside a single transaction with FOR UPDATE.
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

      // ── Phase 8.1: Capture BEFORE state for financial audit ─────────────────
      const beforeInvoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
      if (!beforeInvoice) throw new NotFoundError('Invoice', input.invoiceId);

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
        inc('payment_failure_total');
        throw new BadRequestError('Invoice is already paid');
      }

      // ── Phase 8.7: Overpayment guard ──────────────────────────────────────
      const invoiceTotal = Number(lockedInvoice.totalAmount);
      assertPaymentNotExceedingInvoiceTotal(input.amount, invoiceTotal);

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

      // ── Phase 8.1: Financial audit log — Invoice update ───────────────────
      const afterInvoice = await tx.invoice.findUnique({ where: { id: input.invoiceId } });
      if (afterInvoice) {
        await logFinancialAudit({
          tx,
          entityType: 'Invoice',
          entityId: input.invoiceId,
          action: 'PAYMENT_CONFIRMED',
          before: beforeInvoice as unknown as Record<string, unknown>,
          after: afterInvoice as unknown as Record<string, unknown>,
          performedBy: createdBy || 'system',
        });
      }

      // ── Phase 8.1: Financial audit log — Payment create ────────────────────
      await logFinancialAudit({
        tx,
        entityType: 'Payment',
        entityId: paymentId,
        action: 'PAYMENT_CREATED',
        before: null,
        after: payment as unknown as Record<string, unknown>,
        performedBy: createdBy || 'system',
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

    inc('payment_success_total');
    return result;
  }

  /**
   * Phase 8.2: Undo a confirmed payment match — reverts payment to PENDING
   * and restores invoice to its previous status.
   * Idempotent: if reversedAt != null, throws ConflictError.
   */
  async undoPaymentMatch(
    paymentId: string,
    restoredBy: string,
    reason: string,
    requestId?: string,
  ): Promise<{ payment: unknown; invoice: unknown }> {
    const exists = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, status: true } });
    if (!exists) throw new NotFoundError('Payment', paymentId);

    if (exists.status !== PAYMENT_STATUS.CONFIRMED) {
      throw new BadRequestError(`Cannot undo non-confirmed payment (status: ${exists.status})`);
    }

    const result = await prisma.$transaction(async (tx) => {
      // ── Phase 8.5 FIX: Use SELECT ... FOR UPDATE as atomic guard
      // Row lock prevents concurrent undo; lock failure → correct error
      const [row] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM payments
        WHERE id = ${paymentId}
          AND status = ${PAYMENT_STATUS.CONFIRMED}
          AND "reversedAt" IS NULL
        FOR UPDATE
      `;

      if (!row) {
        const current = await tx.payment.findUnique({ where: { id: paymentId } });
        if (!current) throw new NotFoundError('Payment', paymentId);
        if (current.reversedAt) throw new ConflictError('Payment match already undone');
        throw new ConflictError('Payment status was modified by a concurrent operation. Please retry.');
      }

      // Locked — fetch for audit log
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundError('Payment', paymentId); // should be impossible
      if (!payment.matchedInvoiceId) throw new BadRequestError('Payment has no matched invoice');

      const beforePayment = payment;
      const beforeInvoice = await tx.invoice.findUnique({ where: { id: payment.matchedInvoiceId } });
      if (!beforeInvoice) throw new NotFoundError('Invoice', payment.matchedInvoiceId);

      // Apply the restore fields (within row lock — safe)
      const restored = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PAYMENT_STATUS.PENDING,
          matchedInvoiceId: null,
          matchedAt: null,
          confirmedAt: null,
          confirmedBy: null,
          reversedAt: new Date(),
          reversedBy: restoredBy,
          reversalReason: reason,
        },
      });

      // Revert invoice status with version check (strict concurrency enforcement)
      const beforeInvoicePaidAt = beforeInvoice.paidAt;
      const beforeInvoiceStatus = beforeInvoice.status;
      const restoredInvoice = await versionedUpdate(tx, tx.invoice,
        { id: beforeInvoice.id, version: beforeInvoice.version },
        {
          status: beforeInvoiceStatus === 'PAID'
            ? (beforeInvoice.dueDate && new Date(beforeInvoice.dueDate) < new Date() ? 'OVERDUE' : 'SENT')
            : beforeInvoiceStatus,
          paidAt: beforeInvoicePaidAt,
        },
      );

      // Financial audit logs
      await logFinancialAudit({
        tx,
        entityType: 'Payment',
        entityId: paymentId,
        action: 'PAYMENT_MATCH_UNDONE',
        before: beforePayment as unknown as Record<string, unknown>,
        after: restored as unknown as Record<string, unknown>,
        performedBy: restoredBy,
        correlationId: requestId,
      });
      await logFinancialAudit({
        tx,
        entityType: 'Invoice',
        entityId: beforeInvoice.id,
        action: 'INVOICE_PAYMENT_UNDONE',
        before: beforeInvoice as unknown as Record<string, unknown>,
        after: restoredInvoice as unknown as Record<string, unknown>,
        performedBy: restoredBy,
        correlationId: requestId,
      });

      return { payment: restored, invoice: restoredInvoice };
    });

    await logAudit({
      actorId: restoredBy,
      actorRole: 'ADMIN',
      action: 'PAYMENT_MATCH_UNDONE',
      entityType: 'PAYMENT',
      entityId: paymentId,
      metadata: { reason, invoiceId: (result.invoice as unknown as { id: string }).id },
    });

    logger.info({ type: 'payment_undo_match', paymentId, restoredBy, reason });

    return result as { payment: unknown; invoice: unknown };
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
