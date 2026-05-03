-- ============================================================================
-- Production Hardening Migration
-- FM-11: Remove denormalized hasActiveContract column (replaced by computed query)
-- FM-9:  Add CronJobRun table for crash-recovery scheduling
-- FM-3:  Add requestBodyHash column to IdempotencyRecord
-- FM-1:  Add lineDeliveryId to OutboxEvent for idempotent LINE delivery tracking
-- ============================================================================

-- FM-11: Drop hasActiveContract — it is now computed from the contracts table.
-- Any code still referencing this column must use:
--   contracts: { some: { status: 'ACTIVE', deletedAt: null } }
-- The partial unique index on contracts("roomNo") WHERE status='ACTIVE' already
-- enforces one active contract per room, making the flag redundant.
ALTER TABLE tenants DROP COLUMN IF EXISTS "hasActiveContract";

-- FM-9: Crash-recovery log for scheduled jobs.
-- On startup, instrumentation.ts checks the most recent successful row per jobId
-- and re-runs the job if its last run is older than the expected interval.
CREATE TABLE cron_job_runs (
  id            TEXT        NOT NULL PRIMARY KEY,
  "jobId"       TEXT        NOT NULL,
  "ranAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  success       BOOLEAN     NOT NULL DEFAULT true,
  "durationMs"  INTEGER,
  message       TEXT,
  error         TEXT
);
CREATE INDEX cron_job_runs_job_id_ran_at ON cron_job_runs ("jobId", "ranAt" DESC);

-- FM-3: Store a SHA-256 hash of the canonical request body alongside each
-- idempotency key. On replay, if the hash does not match we return 422 instead
-- of silently returning the cached response for a different operation.
ALTER TABLE idempotency_records
  ADD COLUMN IF NOT EXISTS "requestBodyHash" TEXT;
