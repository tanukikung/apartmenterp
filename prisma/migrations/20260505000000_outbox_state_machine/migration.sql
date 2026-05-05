-- ============================================================
-- Migration: Outbox State Machine + Consumer-Side Dedup
-- ============================================================
-- Adds:
--   - OutboxEventStatus enum + status column on outbox_events
--   - processingAt column (visibility timeout tracking)
--   - deduplicationKey column (unique, prevents duplicate downstream delivery)
--   - invoiceSentAt + notificationSentAt on Invoice (claim-send-release dedup)
-- ============================================================

BEGIN;

-- ── Step 1: Add OutboxEventStatus enum ────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── Step 2: Add outbox_events columns ────────────────────────────────────
ALTER TABLE "outbox_events" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "outbox_events" ADD COLUMN "processingAt" TIMESTAMPTZ;
ALTER TABLE "outbox_events" ADD COLUMN "deduplicationKey" TEXT;

-- Populate status from processedAt to preserve current state
UPDATE "outbox_events" SET "status" = 'PROCESSED' WHERE "processedAt" IS NOT NULL;
UPDATE "outbox_events" SET "status" = 'PENDING' WHERE "processedAt" IS NULL;

-- ── Step 3: Add invoice dedup columns ─────────────────────────────────────
ALTER TABLE "invoices" ADD COLUMN "invoiceSentAt" TIMESTAMPTZ;
ALTER TABLE "invoices" ADD COLUMN "notificationSentAt" TIMESTAMPTZ;

-- ── Step 4: Add deduplicationKey unique constraint ───────────────────────
-- First clean up any existing duplicates (keep oldest by createdAt)
DELETE FROM "outbox_events" WHERE ctid NOT IN (
  SELECT min(ctid) FROM "outbox_events"
  WHERE "deduplicationKey" IS NOT NULL
  GROUP BY "deduplicationKey"
);

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_deduplicationKey_unique" UNIQUE ("deduplicationKey");

-- ── Step 5: Add indexes for new columns ──────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "outbox_events_status_nextRetryAt_idx" ON "outbox_events" ("status", "nextRetryAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "outbox_events_status_processingAt_idx" ON "outbox_events" ("status", "processingAt");

COMMIT;