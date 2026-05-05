-- Phase 8: Financial-Grade, Human-Safe, Long-Term Reliable System
-- Migration: 20260506000000_phase_8_financial_safety_undelete
-- Adds: FinancialAuditLog, ReconciliationIssue tables, reversal/soft-delete fields

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Invoice: reversal + soft-delete fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "reversedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reversedBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "reversalReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "previousStatus"  TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deletedBy"       TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Payment: reversal + soft-delete fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "reversedAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "reversedBy"      TEXT,
  ADD COLUMN IF NOT EXISTS "reversalReason"  TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deletedBy"        TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RoomBilling: soft-delete fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "room_billings"
  ADD COLUMN IF NOT EXISTS "deletedAt"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "deletedBy"       TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FinancialAuditLog: append-only financial-grade audit table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "financial_audit_logs" (
  "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "entityType"      TEXT        NOT NULL,
  "entityId"        TEXT        NOT NULL,
  "action"          TEXT        NOT NULL,
  "before"          JSONB,
  "after"           JSONB,
  "diff"            JSONB,
  "performedBy"     TEXT        NOT NULL,
  "performedByName" TEXT,
  "correlationId"   TEXT,
  "timestamp"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "financial_audit_logs_entity_entityId_timestamp_idx"
  ON "financial_audit_logs" ("entityType", "entityId", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "financial_audit_logs_performedBy_idx"
  ON "financial_audit_logs" ("performedBy");
CREATE INDEX IF NOT EXISTS "financial_audit_logs_correlationId_idx"
  ON "financial_audit_logs" ("correlationId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ReconciliationIssue: anti-corruption detection table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE IF NOT EXISTS "ReconciliationIssueType" AS ENUM (
  'INVOICE_PAYMENT_MISMATCH',
  'PAID_INVOICE_NO_PAYMENT',
  'NEGATIVE_BALANCE',
  'DUPLICATE_PAYMENT_MATCH'
);

CREATE TYPE IF NOT EXISTS "IssueSeverity" AS ENUM (
  'CRITICAL',
  'WARNING',
  'INFO'
);

CREATE TABLE IF NOT EXISTS "reconciliation_issues" (
  "id"          TEXT                         NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "type"        "ReconciliationIssueType"    NOT NULL,
  "entityType"  TEXT                         NOT NULL,
  "entityId"    TEXT                         NOT NULL,
  "severity"    "IssueSeverity"              NOT NULL,
  "description" TEXT                         NOT NULL,
  "metadata"    JSONB,
  "detectedAt"  TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  "resolvedAt"  TIMESTAMPTZ,
  "resolvedBy"  TEXT,
  "resolution"  TEXT,
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "reconciliation_issues_type_severity_idx"
  ON "reconciliation_issues" ("type", "severity");
CREATE INDEX IF NOT EXISTS "reconciliation_issues_entity_idx"
  ON "reconciliation_issues" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "reconciliation_issues_detectedAt_idx"
  ON "reconciliation_issues" ("detectedAt");

-- ─────────────────────────────────────────────────────────────────────────────
-- Record migration
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "_prisma_migrations" ("name", "hash", "finished_at", "logs", "rolled_back_at", "started_at", "applied_steps_count")
VALUES ('20260506000000_phase_8_financial_safety_undelete', 'phase8', NOW(), NULL, NULL, NOW(), 1)
ON CONFLICT ("name") DO NOTHING;