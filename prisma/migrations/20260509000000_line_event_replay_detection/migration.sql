-- Migration: line_event_replay_detection
-- Created: 2026-05-05
--
-- Adds LineEvent and LineReplyToken tables for replay-proof webhook processing.
--
-- LineEvent: append-only ledger of every LINE webhook event we've received.
--   - id = LINE's webhookEventId or a derived deduplication key
--   - result = SUCCESS | FAILED | DUPLICATE_REJECTED
--   - Indexed by (sourceId, processedAt) and (eventType, processedAt)
--
-- LineReplyToken: tracks LINE replyToken usage so we can detect and prevent
--   reuse (replyToken can only be used once per LINE API contract).
--   - token = @id (unique constraint enforced by DB)
--   - usedBy = eventId that consumed this token

-- Create line_events table
CREATE TABLE "line_events" (
  "id"          VARCHAR(255) NOT NULL,
  "replyToken"  VARCHAR(255),
  "eventType"   VARCHAR(100) NOT NULL,
  "sourceType"  VARCHAR(50) NOT NULL,
  "sourceId"    VARCHAR(255) NOT NULL,
  "processedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "result"      VARCHAR(50) NOT NULL,
  "errorMsg"    TEXT,

  CONSTRAINT "line_events_pkey" PRIMARY KEY ("id")
);

-- Index for querying events by source user over time
CREATE INDEX "line_events_sourceId_processedAt_idx"
  ON "line_events" ("sourceId", "processedAt" DESC);

-- Index for querying events by type over time
CREATE INDEX "line_events_eventType_processedAt_idx"
  ON "line_events" ("eventType", "processedAt" DESC);

-- Create line_reply_tokens table
CREATE TABLE "line_reply_tokens" (
  "token"   VARCHAR(255) NOT NULL,
  "usedAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "usedBy"  VARCHAR(255) NOT NULL,

  CONSTRAINT "line_reply_tokens_pkey" PRIMARY KEY ("token")
);

-- Index for TTL cleanup queries (old unused tokens)
CREATE INDEX "line_reply_tokens_usedAt_idx"
  ON "line_reply_tokens" ("usedAt" DESC);

-- NOTE: No down migration needed — this is an additive change.
-- If rollback is needed, use: DROP TABLE "line_events"; DROP TABLE "line_reply_tokens";