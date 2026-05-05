-- Concurrency Locking: Optimistic Lock Version Fields
--
-- Phase 8.8: Multi-Admin Safety — Add version fields to critical models
--
-- Problem:
-- - Two admins could simultaneously try to close a billing period
-- - Concurrent invoice regeneration could create duplicate versions
-- - Room billing updates during import could race
--
-- Solution:
-- - Add `version` column to BillingPeriod, RoomBilling
-- - Invoice already has `version` (added in Phase 8)
-- - All critical operations use UPDATE ... WHERE version = expectedVersion
-- - ConflictError (HTTP 409) returned when version mismatch detected

-- Add version column to billing_periods
ALTER TABLE "billing_periods"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- Add version column to room_billings
ALTER TABLE "room_billings"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- Index on version for monitoring/liveness queries (optional but helpful)
CREATE INDEX IF NOT EXISTS "billing_periods_version_idx" ON "billing_periods"("version");
CREATE INDEX IF NOT EXISTS "room_billings_version_idx" ON "room_billings"("version");
