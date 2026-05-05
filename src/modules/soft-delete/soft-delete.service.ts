/**
 * Phase 8.4: Soft Delete Service
 *
 * Provides soft-delete and restore operations for Invoice, Payment, and RoomBilling.
 * All operations are idempotent and create financial audit log entries.
 */

import { prisma, withTransaction } from '@/lib/db/client';
import { logFinancialAudit } from '@/modules/financial-audit';
import { NotFoundError } from '@/lib/utils/errors';

export class SoftDeleteService {
  /**
   * Soft-delete an invoice (Phase 8.4).
   * Idempotent: returns success if already deleted.
   */
  async softDeleteInvoice(invoiceId: string, deletedBy: string, requestId?: string): Promise<void> {
    const exists = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, deletedAt: true } });
    if (!exists) throw new NotFoundError('Invoice', invoiceId);
    if (exists.deletedAt) return; // idempotent

    await withTransaction(async (tx) => {
      const before = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!before) throw new NotFoundError('Invoice', invoiceId);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { deletedAt: new Date(), deletedBy },
      });

      const after = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (after) {
        await logFinancialAudit({
          tx,
          entityType: 'Invoice',
          entityId: invoiceId,
          action: 'INVOICE_DELETED',
          before: before as unknown as Record<string, unknown>,
          after: after as unknown as Record<string, unknown>,
          performedBy: deletedBy,
          correlationId: requestId,
        });
      }
    });
  }

  /**
   * Restore a soft-deleted invoice (Phase 8.4).
   * Idempotent: returns success if not deleted.
   */
  async restoreInvoice(invoiceId: string, restoredBy: string, requestId?: string): Promise<void> {
    const exists = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, deletedAt: true } });
    if (!exists) throw new NotFoundError('Invoice', invoiceId);
    if (!exists.deletedAt) return; // idempotent

    await withTransaction(async (tx) => {
      const before = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!before) throw new NotFoundError('Invoice', invoiceId);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { deletedAt: null, deletedBy: null },
      });

      const after = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (after) {
        await logFinancialAudit({
          tx,
          entityType: 'Invoice',
          entityId: invoiceId,
          action: 'INVOICE_RESTORED',
          before: before as unknown as Record<string, unknown>,
          after: after as unknown as Record<string, unknown>,
          performedBy: restoredBy,
          correlationId: requestId,
        });
      }
    });
  }

  /**
   * Soft-delete a payment.
   */
  async softDeletePayment(paymentId: string, deletedBy: string, requestId?: string): Promise<void> {
    const exists = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, deletedAt: true } });
    if (!exists) throw new NotFoundError('Payment', paymentId);
    if (exists.deletedAt) return;

    await withTransaction(async (tx) => {
      const before = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!before) throw new NotFoundError('Payment', paymentId);

      await tx.payment.update({
        where: { id: paymentId },
        data: { deletedAt: new Date(), deletedBy },
      });

      const after = await tx.payment.findUnique({ where: { id: paymentId } });
      if (after) {
        await logFinancialAudit({
          tx,
          entityType: 'Payment',
          entityId: paymentId,
          action: 'PAYMENT_DELETED',
          before: before as unknown as Record<string, unknown>,
          after: after as unknown as Record<string, unknown>,
          performedBy: deletedBy,
          correlationId: requestId,
        });
      }
    });
  }

  /**
   * Restore a soft-deleted payment.
   */
  async restorePayment(paymentId: string, restoredBy: string, requestId?: string): Promise<void> {
    const exists = await prisma.payment.findUnique({ where: { id: paymentId }, select: { id: true, deletedAt: true } });
    if (!exists) throw new NotFoundError('Payment', paymentId);
    if (!exists.deletedAt) return;

    await withTransaction(async (tx) => {
      const before = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!before) throw new NotFoundError('Payment', paymentId);

      await tx.payment.update({
        where: { id: paymentId },
        data: { deletedAt: null, deletedBy: null },
      });

      const after = await tx.payment.findUnique({ where: { id: paymentId } });
      if (after) {
        await logFinancialAudit({
          tx,
          entityType: 'Payment',
          entityId: paymentId,
          action: 'PAYMENT_RESTORED',
          before: before as unknown as Record<string, unknown>,
          after: after as unknown as Record<string, unknown>,
          performedBy: restoredBy,
          correlationId: requestId,
        });
      }
    });
  }

  /**
   * Soft-delete a room billing.
   */
  async softDeleteRoomBilling(billingId: string, deletedBy: string, requestId?: string): Promise<void> {
    const exists = await prisma.roomBilling.findUnique({ where: { id: billingId }, select: { id: true, deletedAt: true } });
    if (!exists) throw new NotFoundError('RoomBilling', billingId);
    if (exists.deletedAt) return;

    await withTransaction(async (tx) => {
      const before = await tx.roomBilling.findUnique({ where: { id: billingId } });
      if (!before) throw new NotFoundError('RoomBilling', billingId);

      await tx.roomBilling.update({
        where: { id: billingId },
        data: { deletedAt: new Date(), deletedBy },
      });

      const after = await tx.roomBilling.findUnique({ where: { id: billingId } });
      if (after) {
        await logFinancialAudit({
          tx,
          entityType: 'RoomBilling',
          entityId: billingId,
          action: 'ROOMBILLING_DELETED',
          before: before as unknown as Record<string, unknown>,
          after: after as unknown as Record<string, unknown>,
          performedBy: deletedBy,
          correlationId: requestId,
        });
      }
    });
  }

  /**
   * Restore a soft-deleted room billing.
   */
  async restoreRoomBilling(billingId: string, restoredBy: string, requestId?: string): Promise<void> {
    const exists = await prisma.roomBilling.findUnique({ where: { id: billingId }, select: { id: true, deletedAt: true } });
    if (!exists) throw new NotFoundError('RoomBilling', billingId);
    if (!exists.deletedAt) return;

    await withTransaction(async (tx) => {
      const before = await tx.roomBilling.findUnique({ where: { id: billingId } });
      if (!before) throw new NotFoundError('RoomBilling', billingId);

      await tx.roomBilling.update({
        where: { id: billingId },
        data: { deletedAt: null, deletedBy: null },
      });

      const after = await tx.roomBilling.findUnique({ where: { id: billingId } });
      if (after) {
        await logFinancialAudit({
          tx,
          entityType: 'RoomBilling',
          entityId: billingId,
          action: 'ROOMBILLING_RESTORED',
          before: before as unknown as Record<string, unknown>,
          after: after as unknown as Record<string, unknown>,
          performedBy: restoredBy,
          correlationId: requestId,
        });
      }
    });
  }
}