-- Reconcile checked-in migration history with the current Prisma schema.
-- This closes the gap between older baseline SQL and the shape the app
-- already expects at runtime, so clean installs and upgrades land on one schema.

ALTER TYPE "InvoiceDeliveryStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

ALTER TABLE "admin_users"
    ADD COLUMN IF NOT EXISTS "buildingId" TEXT,
    ADD COLUMN IF NOT EXISTS "lineUserId" TEXT;

ALTER TABLE "billing_rules"
    ADD COLUMN IF NOT EXISTS "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "maxPenalty" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "penaltyPerDay" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "invoices"
    ADD COLUMN IF NOT EXISTS "lateFeeAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lateFeeAppliedAt" TIMESTAMPTZ(6);

ALTER TABLE "notifications"
    ADD COLUMN IF NOT EXISTS "adminId" TEXT,
    ADD COLUMN IF NOT EXISTS "contractId" TEXT,
    ALTER COLUMN "tenantId" DROP NOT NULL;

ALTER TABLE "uploaded_files"
    ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(6),
    ADD COLUMN IF NOT EXISTS "status" "UploadedFileStatus" NOT NULL DEFAULT 'ACTIVE';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'move_outs_contractId_fkey') THEN
        ALTER TABLE "move_outs" DROP CONSTRAINT "move_outs_contractId_fkey";
    END IF;
END $$;

ALTER TABLE "admin_users"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "billing_periods"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "configs"
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "contracts"
    ALTER COLUMN "startDate" TYPE TIMESTAMPTZ(6) USING "startDate" AT TIME ZONE 'UTC',
    ALTER COLUMN "endDate" TYPE TIMESTAMPTZ(6) USING "endDate" AT TIME ZONE 'UTC',
    ALTER COLUMN "terminationDate" TYPE TIMESTAMPTZ(6) USING CASE WHEN "terminationDate" IS NULL THEN NULL ELSE "terminationDate" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "conversations"
    ALTER COLUMN "lastMessageAt" TYPE TIMESTAMPTZ(6) USING "lastMessageAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "delivery_order_items"
    ALTER COLUMN "sentAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "sentAt" IS NULL THEN NULL ELSE "sentAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "delivery_orders"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "document_generation_jobs"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "startedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "startedAt" IS NULL THEN NULL ELSE "startedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "completedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "completedAt" IS NULL THEN NULL ELSE "completedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "document_generation_targets"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "document_template_field_definitions"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "document_template_versions"
    ALTER COLUMN "activatedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "activatedAt" IS NULL THEN NULL ELSE "activatedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "archivedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "archivedAt" IS NULL THEN NULL ELSE "archivedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "document_templates"
    ALTER COLUMN "archivedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "archivedAt" IS NULL THEN NULL ELSE "archivedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "generated_document_files"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "generated_documents"
    ALTER COLUMN "generatedAt" TYPE TIMESTAMPTZ(6) USING "generatedAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "archivedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "archivedAt" IS NULL THEN NULL ELSE "archivedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "import_batches"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "invoice_deliveries"
    ALTER COLUMN "sentAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "sentAt" IS NULL THEN NULL ELSE "sentAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "viewedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "viewedAt" IS NULL THEN NULL ELSE "viewedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "invoices"
    ALTER COLUMN "dueDate" TYPE TIMESTAMPTZ(6) USING "dueDate" AT TIME ZONE 'UTC',
    ALTER COLUMN "issuedAt" TYPE TIMESTAMPTZ(6) USING "issuedAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "sentAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "sentAt" IS NULL THEN NULL ELSE "sentAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "paidAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "paidAt" IS NULL THEN NULL ELSE "paidAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "line_users"
    ALTER COLUMN "lastFetchedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "lastFetchedAt" IS NULL THEN NULL ELSE "lastFetchedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "maintenance_attachments"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "maintenance_comments"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "maintenance_tickets"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "message_templates"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "messages"
    ALTER COLUMN "readAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "readAt" IS NULL THEN NULL ELSE "readAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "sentAt" TYPE TIMESTAMPTZ(6) USING "sentAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "receivedAt" TYPE TIMESTAMPTZ(6) USING "receivedAt" AT TIME ZONE 'UTC';

ALTER TABLE "notifications"
    ALTER COLUMN "scheduledAt" TYPE TIMESTAMPTZ(6) USING "scheduledAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "sentAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "sentAt" IS NULL THEN NULL ELSE "sentAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "outbox_events"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "processedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "processedAt" IS NULL THEN NULL ELSE "processedAt" AT TIME ZONE 'UTC' END;

ALTER TABLE "password_reset_tokens"
    ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(6) USING "expiresAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "usedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "usedAt" IS NULL THEN NULL ELSE "usedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "payment_matches"
    ALTER COLUMN "confirmedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "confirmedAt" IS NULL THEN NULL ELSE "confirmedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "payment_transactions"
    ALTER COLUMN "transactionDate" TYPE TIMESTAMPTZ(6) USING "transactionDate" AT TIME ZONE 'UTC',
    ALTER COLUMN "matchedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "matchedAt" IS NULL THEN NULL ELSE "matchedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "confirmedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "confirmedAt" IS NULL THEN NULL ELSE "confirmedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "rejectedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "rejectedAt" IS NULL THEN NULL ELSE "rejectedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "payments"
    ALTER COLUMN "paidAt" TYPE TIMESTAMPTZ(6) USING "paidAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "matchedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "matchedAt" IS NULL THEN NULL ELSE "matchedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "confirmedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "confirmedAt" IS NULL THEN NULL ELSE "confirmedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "rejectedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "rejectedAt" IS NULL THEN NULL ELSE "rejectedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "room_billings"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "room_tenants"
    ALTER COLUMN "moveInDate" TYPE DATE USING "moveInDate"::DATE,
    ALTER COLUMN "moveOutDate" TYPE DATE USING CASE WHEN "moveOutDate" IS NULL THEN NULL ELSE "moveOutDate"::DATE END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "staff_registration_requests"
    ALTER COLUMN "reviewedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "reviewedAt" IS NULL THEN NULL ELSE "reviewedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "tenant_registrations"
    ALTER COLUMN "reviewedAt" TYPE TIMESTAMPTZ(6) USING CASE WHEN "reviewedAt" IS NULL THEN NULL ELSE "reviewedAt" AT TIME ZONE 'UTC' END,
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "tenants"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
    ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "uploaded_files"
    ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

CREATE INDEX IF NOT EXISTS "admin_users_buildingId_idx" ON "admin_users"("buildingId");
CREATE INDEX IF NOT EXISTS "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "invoices_roomNo_year_month_idx" ON "invoices"("roomNo", "year", "month");
CREATE INDEX IF NOT EXISTS "notifications_adminId_idx" ON "notifications"("adminId");
CREATE INDEX IF NOT EXISTS "notifications_contractId_idx" ON "notifications"("contractId");
CREATE INDEX IF NOT EXISTS "payment_transactions_roomNo_idx" ON "payment_transactions"("roomNo");
CREATE INDEX IF NOT EXISTS "payments_matchedInvoiceId_idx" ON "payments"("matchedInvoiceId");
CREATE INDEX IF NOT EXISTS "room_billings_ruleCode_idx" ON "room_billings"("ruleCode");
CREATE INDEX IF NOT EXISTS "uploaded_files_status_idx" ON "uploaded_files"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "move_outs_contractId_key" ON "move_outs"("contractId");

DO $$
BEGIN
    IF to_regclass('"broadcasts_idempotencyKey_key"') IS NULL THEN
        IF to_regclass('"broadcasts_idempotencyKey_idx"') IS NOT NULL THEN
            ALTER INDEX "broadcasts_idempotencyKey_idx" RENAME TO "broadcasts_idempotencyKey_key";
        ELSE
            CREATE UNIQUE INDEX "broadcasts_idempotencyKey_key" ON "broadcasts"("idempotencyKey");
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('"notifications_roomNo_status_idx"') IS NULL THEN
        IF to_regclass('"notifications_room_no_status_idx"') IS NOT NULL THEN
            ALTER INDEX "notifications_room_no_status_idx" RENAME TO "notifications_roomNo_status_idx";
        ELSE
            CREATE INDEX "notifications_roomNo_status_idx" ON "notifications"("roomNo", "status");
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('"payment_transactions_transactionDate_amount_roomNo_key"') IS NULL THEN
        IF to_regclass('"PaymentTransaction_dedup"') IS NOT NULL THEN
            ALTER INDEX "PaymentTransaction_dedup" RENAME TO "payment_transactions_transactionDate_amount_roomNo_key";
        ELSE
            CREATE UNIQUE INDEX "payment_transactions_transactionDate_amount_roomNo_key"
                ON "payment_transactions"("transactionDate", "amount", "roomNo");
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('"room_billings_calculatedAt_idx"') IS NULL THEN
        IF to_regclass('"room_billings_calculated_at_idx"') IS NOT NULL THEN
            ALTER INDEX "room_billings_calculated_at_idx" RENAME TO "room_billings_calculatedAt_idx";
        ELSE
            CREATE INDEX "room_billings_calculatedAt_idx" ON "room_billings"("calculatedAt");
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('"uploaded_files_mimeType_idx"') IS NULL THEN
        IF to_regclass('"uploaded_files_mime_type_idx"') IS NOT NULL THEN
            ALTER INDEX "uploaded_files_mime_type_idx" RENAME TO "uploaded_files_mimeType_idx";
        ELSE
            CREATE INDEX "uploaded_files_mimeType_idx" ON "uploaded_files"("mimeType");
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'move_outs_contractId_fkey') THEN
        ALTER TABLE "move_outs"
            ADD CONSTRAINT "move_outs_contractId_fkey"
            FOREIGN KEY ("contractId") REFERENCES "contracts"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
