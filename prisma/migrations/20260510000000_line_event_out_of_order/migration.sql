-- Gap 7: Webhook Out-of-Order Protection
-- Add LINE event timestamp tracking for out-of-order event detection
--
-- eventTimestamp: LINE's native event timestamp (milliseconds since epoch)
-- sourceSequenceAt: set to eventTimestamp after successful processing;
--                    used to detect if a newly arrived event is older than
--                    the most recent processed event from the same source

ALTER TABLE line_events ADD COLUMN IF NOT EXISTS event_timestamp BIGINT;
ALTER TABLE line_events ADD COLUMN IF NOT EXISTS source_sequence_at BIGINT;

-- Replace old index (sourceId, processedAt) with two purpose-built indexes
DROP INDEX IF EXISTS line_events_source_id_processed_at_idx;
DROP INDEX IF EXISTS line_events_event_type_processed_at_idx;

CREATE INDEX IF NOT EXISTS line_events_source_ts_idx
  ON line_events(source_id, event_timestamp);
CREATE INDEX IF NOT EXISTS line_events_source_seq_idx
  ON line_events(source_id, source_sequence_at);