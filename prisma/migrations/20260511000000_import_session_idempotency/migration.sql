-- Gap 1: Billing Import Session Idempotency
-- Add ImportSession model for batch-level replay protection.
--
-- ImportSession tracks one logical import of a file per billing period.
-- normalizedHash (order-insensitive) + billingPeriodId uniquely identifies a logical import.
-- A @@unique constraint prevents duplicate sessions for the same (billingPeriodId, normalizedHash).
-- forceImport allows explicit re-import override.

-- Create import_sessions table
CREATE TABLE import_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_id UUID NOT NULL REFERENCES billing_periods(id),
  filename          TEXT NOT NULL,
  file_hash         TEXT NOT NULL,
  normalized_hash   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PROCESSING',
  total_rows        INT NOT NULL DEFAULT 0,
  imported_rows     INT NOT NULL DEFAULT 0,
  skipped_rows      INT NOT NULL DEFAULT 0,
  error_rows        INT NOT NULL DEFAULT 0,
  error_summary     JSONB,
  force_import      BOOLEAN NOT NULL DEFAULT FALSE,
  imported_by       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,

  -- Order-insensitive uniqueness: same data in different row order = same hash
  CONSTRAINT import_session_normalized_hash_unique UNIQUE (billing_period_id, normalized_hash)
);

CREATE INDEX import_sessions_status_idx ON import_sessions(status);
CREATE INDEX import_sessions_billing_period_id_idx ON import_sessions(billing_period_id);

-- Add import_session_id to import_batches (1:1 relationship)
ALTER TABLE import_batches
  ADD COLUMN import_session_id UUID UNIQUE REFERENCES import_sessions(id);