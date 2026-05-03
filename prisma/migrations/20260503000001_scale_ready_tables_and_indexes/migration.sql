-- ============================================================================
-- Scale-ready migration — 2026-05-03
-- Adds: background_jobs, idempotency_keys, missing hot-path indexes
-- ============================================================================

-- ── Background Job Queue ────────────────────────────────────────────────────
-- Enables async processing of heavy operations (bank import, billing generate,
-- PDF generate) so API endpoints return immediately instead of blocking.
-- FOR UPDATE SKIP LOCKED in the worker prevents double-processing across
-- multiple app instances.

CREATE TABLE IF NOT EXISTS "background_jobs" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "type"        TEXT        NOT NULL,
  "payload"     JSONB       NOT NULL,
  "status"      TEXT        NOT NULL DEFAULT 'PENDING',
  "result"      JSONB,
  "error"       TEXT,
  "retryCount"  INTEGER     NOT NULL DEFAULT 0,
  "priority"    INTEGER     NOT NULL DEFAULT 0,
  "scheduledAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "startedAt"   TIMESTAMPTZ,
  "finishedAt"  TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "BackgroundJob_status_scheduledAt_idx"
  ON "background_jobs" ("status", "scheduledAt");

CREATE INDEX IF NOT EXISTS "BackgroundJob_type_status_idx"
  ON "background_jobs" ("type", "status");

CREATE INDEX IF NOT EXISTS "BackgroundJob_createdAt_idx"
  ON "background_jobs" ("createdAt");

-- ── Idempotency Keys ─────────────────────────────────────────────────────────
-- Stores HTTP response bodies keyed by (Idempotency-Key header, request path).
-- Prevents duplicate payments / double-submissions from network retries.

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id"             TEXT        NOT NULL PRIMARY KEY,
  "key"            TEXT        NOT NULL,
  "path"           TEXT        NOT NULL,
  "responseBody"   JSONB       NOT NULL,
  "responseStatus" INTEGER     NOT NULL DEFAULT 200,
  "expiresAt"      TIMESTAMPTZ NOT NULL,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdempotencyKey_key_path_idx"
  ON "idempotency_keys" ("key", "path");

CREATE INDEX IF NOT EXISTS "IdempotencyKey_expiresAt_idx"
  ON "idempotency_keys" ("expiresAt");

-- ── Hot-path indexes missing at 1000-tenant scale ───────────────────────────

-- Payment balance aggregation: WHERE matchedInvoiceId = ? AND status = 'CONFIRMED'
-- This exact filter runs in EVERY payment operation. Without composite index it
-- scans by matchedInvoiceId then filters status in memory.
CREATE INDEX IF NOT EXISTS "Payment_matchedInvoiceId_status_idx"
  ON "payments" ("matchedInvoiceId", "status")
  WHERE "matchedInvoiceId" IS NOT NULL;

-- Outbox worker poll: WHERE processedAt IS NULL AND retryCount < N
-- The processor's SELECT FOR UPDATE SKIP LOCKED needs this to avoid seq-scan.
CREATE INDEX IF NOT EXISTS "OutboxEvent_pending_idx"
  ON "outbox_events" ("createdAt")
  WHERE "processedAt" IS NULL;

-- Invoice status list queries: admin dashboard filters by status heavily
CREATE INDEX IF NOT EXISTS "Invoice_status_createdAt_idx"
  ON "invoices" ("status", "createdAt" DESC);

-- PaymentTransaction dedup + status queries
CREATE INDEX IF NOT EXISTS "PaymentTransaction_status_transactionDate_idx"
  ON "payment_transactions" ("status", "transactionDate");

-- Conversation: LINE webhook looks up lineUserId on every message
-- The existing @@unique([lineUserId]) is the PK index — already covered.
-- Add index on unreadCount for dashboard badge queries
CREATE INDEX IF NOT EXISTS "Conversation_unreadCount_positive_idx"
  ON "conversations" ("unreadCount")
  WHERE "unreadCount" > 0;

-- Tenant soft-delete: all queries filter deletedAt IS NULL
-- Partial index eliminates deleted rows from scans entirely.
CREATE INDEX IF NOT EXISTS "Tenant_active_idx"
  ON "tenants" ("id")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Contract_active_room_idx"
  ON "contracts" ("roomNo", "status")
  WHERE "deletedAt" IS NULL;

-- ── Auto-cleanup for expired idempotency keys (run by db-cleanup job) ────────
-- No triggers needed — the db-cleanup job calls:
--   DELETE FROM idempotency_keys WHERE expiresAt < NOW()
