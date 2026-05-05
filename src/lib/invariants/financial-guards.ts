/**
 * Phase 8.7: Financial Consistency Guards
 *
 * Status machine validation and overpayment guards.
 * All guards throw BadRequestError (not ConflictError) — they represent
 * invalid inputs, not concurrent-modification conflicts.
 */

import { BadRequestError } from '@/lib/utils/errors';

/**
 * Invoice status transition table.
 * Each status maps to the set of statuses it can legally transition to.
 */
const INVOICE_TRANSITIONS: Record<string, Set<string>> = {
  GENERATED:  new Set(['SENT', 'CANCELLED', 'PAID']),
  SENT:       new Set(['VIEWED', 'OVERDUE', 'CANCELLED', 'PAID']),
  VIEWED:     new Set(['OVERDUE', 'CANCELLED', 'PAID']),
  OVERDUE:    new Set(['PAID', 'CANCELLED']),
  PAID:       new Set([]),   // terminal — no transitions allowed
  CANCELLED:  new Set([]),  // terminal — no transitions allowed
};

/**
 * Validates that a status transition is legal for an invoice.
 * Throws BadRequestError if the transition is not allowed.
 */
export function assertInvoiceStatusTransitionValid(
  fromStatus: string,
  toStatus: string,
): void {
  if (fromStatus === toStatus) return; // no-op, not an error

  const allowed = INVOICE_TRANSITIONS[fromStatus];
  if (!allowed) {
    throw new BadRequestError(
      `Invoice status '${fromStatus}' is not recognized — cannot evaluate transition`
    );
  }

  if (!allowed.has(toStatus)) {
    throw new BadRequestError(
      `Invalid invoice status transition: ${fromStatus} → ${toStatus}. ` +
      `Allowed transitions from ${fromStatus}: ${[...allowed].join(', ') || 'none (terminal)'}`
    );
  }
}

/**
 * Validates that a payment does not exceed the invoice total by more than
 * the tolerance amount (1 THB by default).
 *
 * Used as a pre-check before syncInvoicePaymentState to give a clear
 * error message rather than silently failing to transition to PAID.
 *
 * @param paymentAmount  - The incoming payment amount
 * @param invoiceTotal  - The invoice totalAmount
 * @param tolerance     - Maximum overpayment allowed (default 1 THB)
 */
export function assertPaymentNotExceedingInvoiceTotal(
  paymentAmount: number,
  invoiceTotal: number,
  tolerance = 1.0,
): void {
  if (paymentAmount > invoiceTotal + tolerance) {
    throw new BadRequestError(
      `Payment amount (฿${paymentAmount.toFixed(2)}) exceeds invoice total ` +
      `(฿${invoiceTotal.toFixed(2)}) by more than ฿${tolerance} tolerance. ` +
      `Manual review required for overpayment.`
    );
  }
}
