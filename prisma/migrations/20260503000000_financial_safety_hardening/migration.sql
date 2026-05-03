-- Production financial-safety hardening.
-- This migration is intentionally defensive: it adds durable idempotency,
-- outbox claim columns for multi-instance workers, credit tracking for
-- overpayments, and corrected partial indexes on the real mapped table names.

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key"
  ON "payments"("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "payment_credits" (
  "id" TEXT PRIMARY KEY,
  "paymentId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(6),
  "resolvedBy" TEXT,
  CONSTRAINT "payment_credits_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_credits_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_credits_amount_positive_chk"
    CHECK ("amount" > 0),
  CONSTRAINT "payment_credits_status_chk"
    CHECK ("status" IN ('OPEN', 'APPLIED', 'REFUNDED', 'VOID'))
);

CREATE INDEX IF NOT EXISTS "payment_credits_paymentId_idx" ON "payment_credits"("paymentId");
CREATE INDEX IF NOT EXISTS "payment_credits_invoiceId_idx" ON "payment_credits"("invoiceId");
CREATE INDEX IF NOT EXISTS "payment_credits_status_idx" ON "payment_credits"("status");

ALTER TABLE "outbox_events"
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "outbox_events_claim_idx"
  ON "outbox_events"("processedAt", "nextAttemptAt", "lockedAt");

-- Repair earlier migrations that targeted Prisma model names instead of
-- mapped table names. The old indexes are harmless if they never existed.
DROP INDEX IF EXISTS "Payment_confirmed_invoice_unique_idx";
DROP INDEX IF EXISTS "OutboxEvent_aggregate_aggregateId_eventType_unique_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "outbox_events_aggregate_event_once_idx"
  ON "outbox_events"("aggregateType", "aggregateId", "eventType")
  WHERE "processedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_confirmed_invoice_once_idx"
  ON "payment_transactions"("invoiceId")
  WHERE "invoiceId" IS NOT NULL AND "status" = 'CONFIRMED';

CREATE UNIQUE INDEX IF NOT EXISTS "contracts_active_room_unique"
  ON "contracts"("roomNo")
  WHERE "status" = 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive_chk') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive_chk" CHECK ("amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_transactions_amount_positive_chk') THEN
    ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_amount_positive_chk" CHECK ("amount" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_amount_non_negative_chk') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_non_negative_chk"
      CHECK ("totalAmount" >= 0 AND "lateFeeAmount" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_billings_amounts_non_negative_chk') THEN
    ALTER TABLE "room_billings" ADD CONSTRAINT "room_billings_amounts_non_negative_chk"
      CHECK (
        "rentAmount" >= 0 AND
        "waterUnits" >= 0 AND
        "waterTotal" >= 0 AND
        "electricUnits" >= 0 AND
        "electricTotal" >= 0 AND
        "furnitureFee" >= 0 AND
        "otherFee" >= 0 AND
        "totalDue" >= 0
      );
  END IF;
END $$;
