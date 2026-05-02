/**
 * Invoice Status Derivation Helper
 *
 * Computes the effective invoice status based on stored status + due date.
 * This is the authoritative way to determine what an invoice's status should be.
 *
 * Stored statuses: GENERATED, SENT, VIEWED, PAID, OVERDUE, CANCELLED
 * Effective status: same as stored, except OVERDUE is derived when dueDate < today
 *                    for non-CANCELLED, non-PAID invoices.
 *
 * Usage in query layers (NOT when writing):
 *   const effectiveStatus = getEffectiveInvoiceStatus(invoice);
 *
 * This function should be used in:
 *   - API response serializers
 *   - UI status badge displays
 *   - Overdue KPI calculations
 *   - Any place that reads invoice status for display/filtering
 *
 * Do NOT use this when creating or updating invoices — the stored status
 * should only be changed by the canonical service methods (sendInvoice,
 * checkOverdueInvoices, syncInvoicePaymentState).
 */

/**
 * Derives the effective invoice status.
 * - PAID, CANCELLED: returned as-is (terminal states)
 * - GENERATED, SENT, VIEWED: if dueDate < today, returns OVERDUE
 * - OVERDUE: if dueDate >= today, returns GENERATED (data integrity fix)
 *           otherwise returns OVERDUE
 */
export function getEffectiveInvoiceStatus(params: {
  storedStatus: string;
  dueDate: Date;
  paidAt: Date | null;
}): string {
  const { storedStatus, dueDate, paidAt } = params;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDateNormalized = new Date(dueDate);
  dueDateNormalized.setHours(0, 0, 0, 0);

  // Terminal states — returned as stored
  if (storedStatus === 'PAID') return 'PAID';
  if (storedStatus === 'CANCELLED') return 'CANCELLED';

  // OVERDUE stored but dueDate is not in the past → data integrity issue
  // This handles the case where OVERDUE was incorrectly set at creation time
  if (storedStatus === 'OVERDUE') {
    if (dueDateNormalized >= today) {
      // dueDate hasn't passed yet — shouldn't be OVERDUE
      return 'GENERATED';
    }
    return 'OVERDUE';
  }

  // Active statuses: GENERATED, SENT, VIEWED
  // Derive OVERDUE when dueDate is in the past
  if (storedStatus === 'GENERATED' || storedStatus === 'SENT' || storedStatus === 'VIEWED') {
    if (dueDateNormalized < today) {
      return 'OVERDUE';
    }
    return storedStatus;
  }

  // Fallback: return as stored
  return storedStatus;
}

/**
 * Returns true if the invoice is effectively overdue
 * (either stored as OVERDUE or dueDate has passed for active statuses).
 */
export function isInvoiceOverdue(params: {
  storedStatus: string;
  dueDate: Date;
  paidAt: Date | null;
}): boolean {
  return getEffectiveInvoiceStatus(params) === 'OVERDUE';
}

/**
 * Returns true if the invoice is effectively paid.
 */
export function isInvoicePaid(params: {
  storedStatus: string;
  paidAt: Date | null;
}): boolean {
  return params.storedStatus === 'PAID' && params.paidAt !== null;
}
