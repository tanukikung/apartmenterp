-- DLQ hardening: structured error fields + optimised DLQ query indexes

-- inbox_events: structured error fields
ALTER TABLE inbox_events
  ADD COLUMN IF NOT EXISTS "errorCode"    TEXT,
  ADD COLUMN IF NOT EXISTS "lastFailedAt" TIMESTAMPTZ;

-- DLQ query: list dead events by failure time
CREATE INDEX IF NOT EXISTS inbox_events_dead_idx
  ON inbox_events (status, "lastFailedAt" DESC)
  WHERE status = 'DEAD';

-- outbox_events: structured error fields
ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS "errorCode"    TEXT,
  ADD COLUMN IF NOT EXISTS "lastFailedAt" TIMESTAMPTZ;

-- DLQ query: list dead-letter outbox events by failure time
CREATE INDEX IF NOT EXISTS outbox_events_dead_idx
  ON outbox_events ("lastFailedAt" DESC)
  WHERE "lastError" LIKE 'DEAD_LETTER%';

-- Retry-rate query: failed events in last hour
CREATE INDEX IF NOT EXISTS inbox_events_failed_recent
  ON inbox_events (status, "lastFailedAt")
  WHERE status IN ('FAILED', 'DEAD');
