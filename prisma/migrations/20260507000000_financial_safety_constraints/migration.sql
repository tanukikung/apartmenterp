-- Financial safety hardening: add DB-level unique constraints for duplicate prevention.
-- Applied AFTER all baseline migrations.

-- 1. InvoiceDelivery: one delivery record per channel per invoice.
-- Prevents multiple InvoiceDelivery rows when the same invoice is sent
-- multiple times (concurrent clicks, crash-recovery retries, etc.).
-- The unique constraint makes the DB enforce "one LINE send per invoice".
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_deliveries_invoice_channel_unique_idx"
  ON "invoice_deliveries"("invoiceId", "channel");

-- 2. GeneratedDocument: one version per (template, room, year, month).
-- Prevents duplicate documentVersion numbers from concurrent regeneration calls.
-- Also ensures document version audit trail is trustworthy.
CREATE UNIQUE INDEX IF NOT EXISTS "generated_documents_version_idx"
  ON "generated_documents"("templateId", "roomNo", "year", "month", "documentVersion");

-- 3. IdempotencyRecord: add expiresAt for TTL-based cleanup.
-- Records older than expiresAt can be safely purged by the cleanup job.
ALTER TABLE "idempotency_records"
  ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ(6);

-- 4. Payment: one CONFIRMED payment per invoice.
-- Prevents race-condition double-match where two concurrent confirmMatch calls
-- both pass the application-level check and create two CONFIRMED payments for
-- the same invoice. The partial index enforces this at DB level.
CREATE UNIQUE INDEX IF NOT EXISTS "payment_invoice_confirmed_unique_idx"
  ON "payments"("matchedInvoiceId")
  WHERE "status" = 'CONFIRMED'
    AND "matchedInvoiceId" IS NOT NULL;

-- 5. OutboxEvent: add deduplicationKey column if not already present.
-- (Already added in prior migrations; this is a safety net.)
ALTER TABLE "outbox_events"
  ADD COLUMN IF NOT EXISTS "deduplicationKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "outbox_events_deduplication_key_unique_idx"
  ON "outbox_events"("deduplicationKey")
  WHERE "deduplicationKey" IS NOT NULL;