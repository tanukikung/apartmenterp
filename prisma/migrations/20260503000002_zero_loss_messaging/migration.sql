-- Zero-loss messaging pipeline: inbox events + outbox nextRetryAt

-- InboxEventStatus enum
CREATE TYPE "InboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'DEAD');

-- inbox_events: raw LINE webhook event store (write-first, process-later)
CREATE TABLE inbox_events (
  id            TEXT                NOT NULL PRIMARY KEY,
  source        TEXT                NOT NULL DEFAULT 'LINE',
  "eventId"     TEXT                NOT NULL,
  payload       JSONB               NOT NULL,
  "receivedAt"  TIMESTAMPTZ         NOT NULL DEFAULT now(),
  status        "InboxEventStatus"  NOT NULL DEFAULT 'PENDING',
  "retryCount"  INTEGER             NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMPTZ,
  "processedAt" TIMESTAMPTZ,
  "lastError"   TEXT
);

-- Unique constraint on eventId for idempotent ingest (LINE retries safe)
CREATE UNIQUE INDEX inbox_events_event_id_key ON inbox_events ("eventId");

-- Processor query index: poll PENDING events respecting nextRetryAt
CREATE INDEX inbox_events_status_next_retry ON inbox_events (status, "nextRetryAt");

-- Age-based cleanup index
CREATE INDEX inbox_events_received_at ON inbox_events ("receivedAt");

-- Extend outbox_events: add nextRetryAt for explicit backoff scheduling
ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMPTZ;

-- Index for rate-limit reschedule queries
CREATE INDEX IF NOT EXISTS outbox_events_next_retry
  ON outbox_events ("processedAt", "nextRetryAt");
