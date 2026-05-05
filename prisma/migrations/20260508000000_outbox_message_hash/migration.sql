-- Add messageHash column for exactly-once LINE message deduplication
-- messageHash = SHA256(eventType || aggregateId || payload)
-- The unique index prevents duplicate messageHash values at insert time.
-- On crash-restart, the processor can detect already-sent messages by querying
-- for existing COMPLETED events with the same messageHash.

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS message_hash VARCHAR(64);

-- Pre-populate messageHash for existing events that have a deduplicationKey
-- (those are the ones that were using dedup). Old events without dedupKey
-- will get their hash computed on first processing.
UPDATE outbox_events
SET message_hash = encode(
    sha256(concat_ws('',
      event_type,
      aggregate_id,
      payload::text
    )::bytea),
    'hex'
  )
WHERE message_hash IS NULL
  AND deduplication_key IS NOT NULL;

-- Unique index for crash-safe exactly-once deduplication.
-- If two events somehow get the same messageHash (SHA256 collision), the
-- unique constraint prevents the second insert — that event must be skipped.
CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_message_hash_uidx
  ON outbox_events (message_hash)
  WHERE message_hash IS NOT NULL;

-- Index for fast dedup lookups during crash recovery
CREATE INDEX IF NOT EXISTS outbox_events_message_hash_idx
  ON outbox_events (message_hash)
  WHERE message_hash IS NOT NULL;
