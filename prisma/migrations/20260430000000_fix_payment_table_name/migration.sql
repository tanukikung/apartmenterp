-- Corrective migration: the previous migration 20260430000000 referenced
-- the table as "Payment" but the actual table name (via @@map) is "payments".
-- This migration:
-- 1. Marks the failed migration as rolled back
-- 2. Creates the correct partial unique index on the actual "payments" table

-- Step 1: Drop the incorrectly named index (if it somehow got created)
DROP INDEX IF EXISTS "Payment_confirmed_invoice_unique_idx";

-- Create the correct partial unique index on "payments" (not "Payment")
-- Note: column names must be double-quoted to preserve camelCase
CREATE UNIQUE INDEX "payments_confirmed_invoice_unique_idx"
  ON "payments" ("matchedInvoiceId")
  WHERE "matchedInvoiceId" IS NOT NULL AND status = 'CONFIRMED';