/**
 * Payment Tolerance Modes
 *
 * Replaces percentage-based EPSILON with explicit tolerance modes.
 * No invoice can transition to PAID unless the payment condition
 * is explicitly satisfied under the configured mode.
 */

export enum PaymentMatchMode {
  /**
   * Exact match only — totalPaid must equal totalOwed within
   * floating-point safety threshold (< 0.001 THB).
   * Use for: high-value transactions, strict compliance.
   */
  STRICT = 'STRICT',

  /**
   * Allow small difference up to 1 THB absolute tolerance.
   * Use for: cash payments where coin rounding may apply.
   * This is the DEFAULT mode.
   */
  ALLOW_SMALL_DIFF = 'ALLOW_SMALL_DIFF',
}

/** Absolute tolerance amount in THB for ALLOW_SMALL_DIFF mode */
export const TOLERANCE_AMOUNT = 1.0;

/**
 * Determines if a payment is considered settled (sufficient) for the given mode.
 *
 * @param totalPaid   - Sum of confirmed payment amounts
 * @param totalOwed   - Invoice totalAmount + lateFeeAmount
 * @param mode        - Tolerance mode to apply
 * @returns true if the payment satisfies the settlement condition
 */
export function isPaymentSettled(
  totalPaid: number,
  totalOwed: number,
  mode: PaymentMatchMode = PaymentMatchMode.ALLOW_SMALL_DIFF,
): boolean {
  const diff = Math.abs(totalPaid - totalOwed);

  if (mode === PaymentMatchMode.STRICT) {
    // Only floating-point rounding safety — essentially exact match
    return diff < 0.001;
  }

  // ALLOW_SMALL_DIFF: tolerance up to TOLERANCE_AMOUNT (1 THB)
  return diff <= TOLERANCE_AMOUNT;
}

/**
 * Returns a human-readable description of why settlement failed.
 */
export function paymentSettlementReason(
  totalPaid: number,
  totalOwed: number,
  mode: PaymentMatchMode = PaymentMatchMode.ALLOW_SMALL_DIFF,
): string {
  const diff = Math.abs(totalPaid - totalOwed);
  const shortfall = totalOwed - totalPaid;

  if (mode === PaymentMatchMode.STRICT) {
    return `STRICT mode: paid ฿${totalPaid.toFixed(2)}, owed ฿${totalOwed.toFixed(2)}, diff ฿${diff.toFixed(2)} (must be < ฿0.001)`;
  }
  if (shortfall > TOLERANCE_AMOUNT) {
    return `ALLOW_SMALL_DIFF mode: paid ฿${totalPaid.toFixed(2)}, owed ฿${totalOwed.toFixed(2)}, shortfall ฿${shortfall.toFixed(2)} (max allowed: ฿${TOLERANCE_AMOUNT})`;
  }
  return `ALLOW_SMALL_DIFF mode: diff ฿${diff.toFixed(2)} within ฿${TOLERANCE_AMOUNT} tolerance`;
}