-- Add lastAttemptAt to outbox_events to track when the last processing attempt
-- occurred. The backoff calculation now measures elapsed time from lastAttemptAt
-- instead of createdAt, which prevents flooding when events are older than their
-- backoff window (e.g. after a service restart following a prolonged outage).

ALTER TABLE "outbox_events"
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "OutboxEvent_lastAttemptAt_idx"
  ON "outbox_events" ("lastAttemptAt");
