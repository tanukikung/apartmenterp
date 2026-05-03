-- Migration: invoice_notification_sent_at
-- Adds a one-shot idempotency flag to the invoices table so the
-- payment-notifier handler can atomically claim the right to send a
-- LINE receipt. Without this, the outbox AT-LEAST-ONCE guarantee means
-- a retried event can send duplicate receipts to tenants.
--
-- The handler uses:
--   UPDATE invoices SET "notificationSentAt" = NOW()
--   WHERE id = $1 AND "notificationSentAt" IS NULL
-- and skips sending if rows_affected = 0.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS "notificationSentAt" TIMESTAMPTZ;

-- Partial index: only index rows where notification has been sent.
-- Dashboard or admin queries that want to find invoices with pending
-- notifications can filter WHERE "notificationSentAt" IS NULL efficiently.
CREATE INDEX IF NOT EXISTS "Invoice_notificationSentAt_idx"
  ON invoices ("notificationSentAt")
  WHERE "notificationSentAt" IS NOT NULL;
