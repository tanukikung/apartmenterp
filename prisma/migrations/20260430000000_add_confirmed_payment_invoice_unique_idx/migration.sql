-- Partial unique index: prevents two CONFIRMED payments from matching the same invoice.
-- Only applies when matchedInvoiceId IS NOT NULL and status = 'CONFIRMED'.
-- Concurrent bank statement imports that both auto-confirm the same invoice will
-- have the second INSERT fail with a unique constraint violation (P2002) at the
-- Payment record level, rather than leaking through as a server error.

CREATE UNIQUE INDEX "Payment_confirmed_invoice_unique_idx"
  ON "Payment" (matchedInvoiceId)
  WHERE matchedInvoiceId IS NOT NULL AND status = 'CONFIRMED';
