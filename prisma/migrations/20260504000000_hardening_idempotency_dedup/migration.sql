-- Migration: hardening_idempotency_dedup
-- Adds idempotencyKey to background_jobs and deduplicationKey to outbox_events.
-- Partial unique indexes allow NULLs (multiple NULL values do not conflict).

-- ── background_jobs ──────────────────────────────────────────────────────────

ALTER TABLE background_jobs
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "BackgroundJob_idempotencyKey_idx"
  ON background_jobs ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

-- ── outbox_events ────────────────────────────────────────────────────────────

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS "deduplicationKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "OutboxEvent_deduplicationKey_idx"
  ON outbox_events ("deduplicationKey")
  WHERE "deduplicationKey" IS NOT NULL;
