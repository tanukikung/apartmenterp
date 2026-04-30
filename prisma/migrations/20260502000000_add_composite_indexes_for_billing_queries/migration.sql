-- HIGH-68 fix: Add composite indexes for billing and overdue invoice queries
-- Invoice(status, dueDate): for overdue invoice checks
-- RoomBilling(billingPeriodId, status): for billing period status queries
-- Contract(status, endDate): for expiring contracts query

-- Invoice composite index
CREATE INDEX IF NOT EXISTS "Invoice_status_dueDate_idx"
ON "invoices" ("status", "dueDate");

-- RoomBilling composite index
CREATE INDEX IF NOT EXISTS "RoomBilling_billingPeriodId_status_idx"
ON "room_billings" ("billingPeriodId", "status");

-- Contract composite index
CREATE INDEX IF NOT EXISTS "Contract_status_endDate_idx"
ON "contracts" ("status", "endDate");