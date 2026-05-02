/**
 * Hard Invariant Assertions
 *
 * These functions enforce CRITICAL business invariants that should NEVER be violated.
 * If any of these throw, it indicates a code bug — not a user error.
 *
 * All functions throw DataIntegrityError on violation.
 */

import type { Prisma } from '@prisma/client';
import { DataIntegrityError } from '@/lib/utils/errors';
import { getEffectiveInvoiceStatus } from '@/modules/invoices/status';

/**
 * Assert that an invoice has sufficient CONFIRMED payments covering totalOwed.
 * Throws DataIntegrityError if:
 *   - No CONFIRMED payments exist for the invoice
 *   - Total paid < total amount owed (including late fees)
 */
export async function assertInvoiceHasSufficientPayment(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, totalAmount: true, lateFeeAmount: true, status: true },
  });

  if (!invoice) return; // NotFoundError will be thrown by caller

  const totals = await tx.payment.aggregate({
    where: { matchedInvoiceId: invoiceId, status: 'CONFIRMED' },
    _sum: { amount: true },
  });

  const totalPaid = Number(totals._sum.amount ?? 0);
  const totalOwed = Number(invoice.totalAmount) + Number(invoice.lateFeeAmount ?? 0);

  if (totalPaid < totalOwed) {
    throw new DataIntegrityError(
      `Invoice ${invoiceId}: insufficient payment. Paid ฿${totalPaid.toFixed(2)}, owed ฿${totalOwed.toFixed(2)}`,
      { invoiceId, totalPaid, totalOwed },
    );
  }
}

/**
 * Assert that a room has at least one ACTIVE contract.
 * Throws DataIntegrityError if the room is OCCUPIED but has no ACTIVE contract.
 */
export async function assertRoomHasActiveContract(
  tx: Prisma.TransactionClient,
  roomNo: string,
): Promise<void> {
  const activeContract = await tx.contract.findFirst({
    where: { roomNo, status: 'ACTIVE' },
    select: { id: true },
  });

  if (!activeContract) {
    throw new DataIntegrityError(
      `Room ${roomNo}: OCCUPIED but no ACTIVE contract found`,
      { roomNo },
    );
  }
}

/**
 * Assert that a stored OVERDUE invoice has a dueDate that is actually in the past.
 * Throws DataIntegrityError if storedStatus=OVERDUE but dueDate >= today (data corruption).
 */
export async function assertInvoiceNotOverdueWithFutureDate(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, dueDate: true },
  });

  if (!invoice) return; // NotFoundError will be thrown by caller

  if (invoice.status === 'OVERDUE') {
    const effectiveStatus = getEffectiveInvoiceStatus({
      storedStatus: invoice.status,
      dueDate: invoice.dueDate,
      paidAt: null,
    });

    if (effectiveStatus !== 'OVERDUE') {
      throw new DataIntegrityError(
        `Invoice ${invoiceId}: stored as OVERDUE but dueDate is not in the past (effective status: ${effectiveStatus})`,
        { invoiceId, storedStatus: invoice.status, dueDate: invoice.dueDate },
      );
    }
  }
}

/**
 * Assert that a PAID invoice has a non-null paidAt timestamp.
 * Throws DataIntegrityError if status=PAID but paidAt is null.
 */
export async function assertInvoicePaidHasPaidAt(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, paidAt: true },
  });

  if (!invoice) return; // NotFoundError will be thrown by caller

  if (invoice.status === 'PAID' && !invoice.paidAt) {
    throw new DataIntegrityError(
      `Invoice ${invoiceId}: status is PAID but paidAt is null`,
      { invoiceId },
    );
  }
}

/**
 * Comprehensive defensive check — call after any critical state transition
 * to ensure invariants hold. This is a belt-and-suspenders check.
 */
export async function assertInvoiceInvariants(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  await assertInvoiceHasSufficientPayment(tx, invoiceId);
  await assertInvoiceNotOverdueWithFutureDate(tx, invoiceId);
  await assertInvoicePaidHasPaidAt(tx, invoiceId);
}

/**
 * Assert that a room's status is OCCUPIED before allowing termination.
 * Throws DataIntegrityError if trying to terminate a contract on a non-OCCUPIED room.
 */
export async function assertRoomIsOccupiedForTermination(
  tx: Prisma.TransactionClient,
  roomNo: string,
): Promise<void> {
  const room = await tx.room.findUnique({
    where: { roomNo },
    select: { roomNo: true, roomStatus: true },
  });

  if (!room) return; // NotFoundError will be thrown by caller

  if (room.roomStatus !== 'OCCUPIED') {
    throw new DataIntegrityError(
      `Room ${roomNo}: contract termination attempted but room status is ${room.roomStatus} (expected OCCUPIED)`,
      { roomNo, roomStatus: room.roomStatus },
    );
  }
}