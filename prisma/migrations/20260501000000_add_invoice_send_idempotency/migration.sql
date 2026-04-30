-- Add lastInvoiceSendAt to BillingPeriod for idempotent invoice sending
-- This prevents the same invoices from being sent multiple times if the job runs twice

ALTER TABLE "billing_periods" ADD COLUMN IF NOT EXISTS "lastInvoiceSendAt" TIMESTAMPTZ(6);