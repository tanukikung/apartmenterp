-- Gap 6: Outbox Cross-Process Deduplication
-- Add externalId and callerIdempotencyKey to outbox_events for multi-layer deduplication.
-- Layer 1: caller-provided idempotency key (most specific)
-- Layer 2: messageHash (deterministic hash)
-- Layer 3: composite unique on (eventType, aggregateId, externalId)

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS caller_idempotency_key VARCHAR(255);

-- Partial unique index: only enforce for non-null external_id values.
-- PostgreSQL allows multiple NULLs in a partial unique index (correct behavior:
-- we can't dedupe events with unknown external IDs).
CREATE UNIQUE INDEX IF NOT EXISTS outbox_event_composite_uidx
ON outbox_events(event_type, aggregate_id, external_id)
WHERE external_id IS NOT NULL;

-- Index for fast caller idempotency key lookups during crash-recovery dedup.
CREATE INDEX IF NOT EXISTS outbox_events_caller_idem_key_idx
ON outbox_events(caller_idempotency_key)
WHERE caller_idempotency_key IS NOT NULL;

-- Index for composite lookups (eventType + aggregateId + externalId) used in dedup checks.
CREATE INDEX IF NOT EXISTS outbox_events_evt_agg_ext_idx
ON outbox_events(event_type, aggregate_id, external_id);