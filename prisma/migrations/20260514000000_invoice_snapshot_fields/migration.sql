-- Gap-2: Invoice Financial Snapshot Fields
-- Freezes invoice financial state at SENT time so payment matching uses immutable values.
-- Prevents billing edits after send from breaking payment reconciliation.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "snapshotTotal" DECIMAL(10,2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "snapshotLateFee" DECIMAL(10,2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "snapshotHash" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "snapshotLineItems" JSONB;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "snapshotRent" DECIMAL(10,2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "snapshotWater" DECIMAL(10,2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "snapshotElectric" DECIMAL(10,2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "snapshotOther" DECIMAL(10,2);