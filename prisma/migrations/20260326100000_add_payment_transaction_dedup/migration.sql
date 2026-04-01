-- Add roomNo field to payment_transactions (required for dedup)
ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "roomNo" TEXT;

-- Add unique constraint for dedup of payment transactions
-- Prevents duplicate imports: same date + amount + room = duplicate
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_dedup"
  ON "payment_transactions" ("transactionDate", "amount", "roomNo");
