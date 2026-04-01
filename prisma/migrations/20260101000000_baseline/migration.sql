-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "MeterMode" AS ENUM ('NORMAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "ServiceFeeMode" AS ENUM ('NONE', 'FLAT_ROOM', 'PER_UNIT', 'MANUAL_FEE');

-- CreateEnum
CREATE TYPE "BillingPeriodStatus" AS ENUM ('OPEN', 'LOCKED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RoomBillingStatus" AS ENUM ('DRAFT', 'LOCKED', 'INVOICED');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'MATCHED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'AUTO_MATCHED', 'NEED_REVIEW', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "PaymentMatchType" AS ENUM ('FULL', 'PARTIAL', 'OVERPAY', 'UNDERPAY');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'STICKER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INVOICE_REMINDER', 'PAYMENT_REMINDER', 'NOTICE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "StaffRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TenantRegistrationStatus" AS ENUM ('PENDING', 'CORRECTION_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentTemplateVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentFieldCategory" AS ENUM ('ROOM', 'TENANT', 'CONTRACT', 'BILLING', 'BILLING_ITEM', 'PAYMENT', 'APARTMENT', 'SYSTEM', 'COMPUTED');

-- CreateEnum
CREATE TYPE "DocumentFieldValueType" AS ENUM ('STRING', 'NUMBER', 'DATE', 'BOOLEAN', 'CURRENCY', 'ARRAY', 'OBJECT', 'HTML');

-- CreateEnum
CREATE TYPE "DocumentGenerationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentGenerationTargetStatus" AS ENUM ('PENDING', 'SUCCESS', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentSourceScope" AS ENUM ('SINGLE_ROOM', 'SELECTED_ROOMS', 'FLOOR', 'ELIGIBLE_FOR_MONTH', 'OCCUPIED_ROOMS', 'ROOMS_WITH_BILLING');

-- CreateEnum
CREATE TYPE "GeneratedDocumentStatus" AS ENUM ('GENERATED', 'EXPORTED', 'SENT', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "GeneratedDocumentFileRole" AS ENUM ('SOURCE_HTML', 'PDF', 'DOCX', 'ZIP_BUNDLE', 'PREVIEW');

-- CreateEnum
CREATE TYPE "InvoiceDeliveryChannel" AS ENUM ('LINE', 'PDF', 'PRINT');

-- CreateEnum
CREATE TYPE "InvoiceDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'VIEWED');

-- CreateEnum
CREATE TYPE "MessageTemplateType" AS ENUM ('INVOICE_SEND', 'PAYMENT_REMINDER', 'OVERDUE_NOTICE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DocumentTemplateType" AS ENUM ('INVOICE', 'PAYMENT_NOTICE', 'CONTRACT', 'RECEIPT', 'GENERAL_NOTICE', 'NOTICE', 'OTHER');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankAccountNo" TEXT NOT NULL,
    "promptpay" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_rules" (
    "code" TEXT NOT NULL,
    "descriptionTh" TEXT NOT NULL,
    "waterEnabled" BOOLEAN NOT NULL,
    "waterUnitPrice" DECIMAL(10,2) NOT NULL,
    "waterMinCharge" DECIMAL(10,2) NOT NULL,
    "waterServiceFeeMode" "ServiceFeeMode" NOT NULL,
    "waterServiceFeeAmount" DECIMAL(10,2) NOT NULL,
    "electricEnabled" BOOLEAN NOT NULL,
    "electricUnitPrice" DECIMAL(10,2) NOT NULL,
    "electricMinCharge" DECIMAL(10,2) NOT NULL,
    "electricServiceFeeMode" "ServiceFeeMode" NOT NULL,
    "electricServiceFeeAmount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "billing_rules_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "rooms" (
    "roomNo" TEXT NOT NULL,
    "floorNo" INTEGER NOT NULL,
    "defaultAccountId" TEXT NOT NULL,
    "defaultRuleCode" TEXT NOT NULL,
    "defaultRentAmount" DECIMAL(10,2) NOT NULL,
    "hasFurniture" BOOLEAN NOT NULL DEFAULT false,
    "defaultFurnitureAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "roomStatus" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "lineUserId" TEXT,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("roomNo")
);

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "BillingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "dueDay" INTEGER NOT NULL DEFAULT 25,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_billings" (
    "id" TEXT NOT NULL,
    "billingPeriodId" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "recvAccountOverrideId" TEXT,
    "recvAccountId" TEXT NOT NULL,
    "ruleOverrideCode" TEXT,
    "ruleCode" TEXT NOT NULL,
    "rentAmount" DECIMAL(10,2) NOT NULL,
    "waterMode" "MeterMode" NOT NULL,
    "waterPrev" DECIMAL(10,2),
    "waterCurr" DECIMAL(10,2),
    "waterUnitsManual" DECIMAL(10,2),
    "waterUnits" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "waterUsageCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "waterServiceFeeManual" DECIMAL(10,2),
    "waterServiceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "waterTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "electricMode" "MeterMode" NOT NULL,
    "electricPrev" DECIMAL(10,2),
    "electricCurr" DECIMAL(10,2),
    "electricUnitsManual" DECIMAL(10,2),
    "electricUnits" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "electricUsageCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "electricServiceFeeManual" DECIMAL(10,2),
    "electricServiceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "electricTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "furnitureFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "otherFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalDue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "checkNotes" TEXT,
    "status" "RoomBillingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "roomBillingId" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'GENERATED',
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "accessToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_deliveries" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "channel" "InvoiceDeliveryChannel" NOT NULL,
    "status" "InvoiceDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "recipientRef" TEXT,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdBy" TEXT,
    "documentTemplateId" TEXT,
    "documentTemplateHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "billingPeriodId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "rowsTotal" INTEGER NOT NULL,
    "rowsImported" INTEGER NOT NULL,
    "rowsSkipped" INTEGER NOT NULL,
    "rowsErrored" INTEGER NOT NULL,
    "status" "ImportBatchStatus" NOT NULL,
    "errorLog" JSONB,
    "importedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "sourceFile" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "matchedInvoiceId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "sourceFile" TEXT NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "confidenceScore" DECIMAL(3,2),
    "invoiceId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectReason" TEXT,
    "bankAccountId" TEXT,
    "matchedAmount" DECIMAL(12,2),
    "matchType" "PaymentMatchType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_matches" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "confidence" "MatchConfidence" NOT NULL,
    "matchCriteria" JSONB,
    "isAutoMatched" BOOLEAN NOT NULL DEFAULT false,
    "status" "PaymentMatchStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "emergencyContact" TEXT,
    "emergencyPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_tenants" (
    "id" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "moveInDate" TIMESTAMP(3) NOT NULL,
    "moveOutDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "primaryTenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "monthlyRent" DECIMAL(10,2) NOT NULL,
    "deposit" DECIMAL(10,2),
    "furnitureFee" DECIMAL(10,2),
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "terminationDate" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_users" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "pictureUrl" TEXT,
    "statusMessage" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "tenantId" TEXT,
    "roomNo" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "lineMessageId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "roomNo" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "content" TEXT NOT NULL,
    "lineMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MessageTemplateType" NOT NULL DEFAULT 'CUSTOM',
    "body" TEXT NOT NULL,
    "variables" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "assignedStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_comments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_attachments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "details" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_registration_requests" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "StaffRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_registrations" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "lineDisplayName" TEXT,
    "phone" TEXT,
    "claimedRoom" TEXT,
    "status" "TenantRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "correctionNote" TEXT,
    "resolvedRoomNo" TEXT,
    "resolvedTenantId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentTemplateType" NOT NULL DEFAULT 'INVOICE',
    "description" TEXT,
    "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "activeVersionId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_versions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "DocumentTemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "fileType" TEXT NOT NULL DEFAULT 'html',
    "fileName" TEXT,
    "storageKey" TEXT,
    "checksum" TEXT,
    "sourceFileId" TEXT,
    "createdById" TEXT,
    "activatedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_template_field_definitions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "DocumentFieldCategory" NOT NULL,
    "valueType" "DocumentFieldValueType" NOT NULL,
    "path" TEXT NOT NULL,
    "description" TEXT,
    "sampleValue" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isCollection" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_template_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_generation_jobs" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "requestedById" TEXT,
    "billingPeriodId" TEXT,
    "year" INTEGER,
    "month" INTEGER,
    "scope" "DocumentSourceScope" NOT NULL,
    "selection" JSONB,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "status" "DocumentGenerationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "totalRequested" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "bundleFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_generation_targets" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "roomBillingId" TEXT,
    "invoiceId" TEXT,
    "contractId" TEXT,
    "tenantId" TEXT,
    "status" "DocumentGenerationTargetStatus" NOT NULL DEFAULT 'PENDING',
    "generatedDocumentId" TEXT,
    "reason" TEXT,
    "renderSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_generation_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_documents" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "generationJobId" TEXT,
    "documentType" "DocumentTemplateType" NOT NULL,
    "status" "GeneratedDocumentStatus" NOT NULL DEFAULT 'GENERATED',
    "title" TEXT NOT NULL,
    "subject" TEXT,
    "sourceScope" "DocumentSourceScope" NOT NULL,
    "roomNo" TEXT NOT NULL,
    "billingPeriodId" TEXT,
    "roomBillingId" TEXT,
    "invoiceId" TEXT,
    "contractId" TEXT,
    "tenantId" TEXT,
    "year" INTEGER,
    "month" INTEGER,
    "documentVersion" INTEGER NOT NULL DEFAULT 1,
    "generatedById" TEXT,
    "renderContext" JSONB,
    "validation" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_document_files" (
    "id" TEXT NOT NULL,
    "generatedDocumentId" TEXT NOT NULL,
    "uploadedFileId" TEXT NOT NULL,
    "role" "GeneratedDocumentFileRole" NOT NULL,
    "format" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_InvoiceToPayment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "rooms_floorNo_idx" ON "rooms"("floorNo");

-- CreateIndex
CREATE INDEX "rooms_roomStatus_idx" ON "rooms"("roomStatus");

-- CreateIndex
CREATE INDEX "rooms_defaultAccountId_idx" ON "rooms"("defaultAccountId");

-- CreateIndex
CREATE INDEX "billing_periods_status_idx" ON "billing_periods"("status");

-- CreateIndex
CREATE INDEX "billing_periods_year_month_idx" ON "billing_periods"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_year_month_key" ON "billing_periods"("year", "month");

-- CreateIndex
CREATE INDEX "room_billings_billingPeriodId_idx" ON "room_billings"("billingPeriodId");

-- CreateIndex
CREATE INDEX "room_billings_roomNo_idx" ON "room_billings"("roomNo");

-- CreateIndex
CREATE INDEX "room_billings_status_idx" ON "room_billings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "room_billings_billingPeriodId_roomNo_key" ON "room_billings"("billingPeriodId", "roomNo");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_roomBillingId_key" ON "invoices"("roomBillingId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_accessToken_key" ON "invoices"("accessToken");

-- CreateIndex
CREATE INDEX "invoices_roomNo_idx" ON "invoices"("roomNo");

-- CreateIndex
CREATE INDEX "invoices_year_month_idx" ON "invoices"("year", "month");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoice_deliveries_invoiceId_idx" ON "invoice_deliveries"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_deliveries_channel_status_idx" ON "invoice_deliveries"("channel", "status");

-- CreateIndex
CREATE INDEX "import_batches_billingPeriodId_idx" ON "import_batches"("billingPeriodId");

-- CreateIndex
CREATE INDEX "import_batches_status_idx" ON "import_batches"("status");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "payments_amount_idx" ON "payments"("amount");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE INDEX "payment_transactions_transactionDate_idx" ON "payment_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "payment_transactions_amount_idx" ON "payment_transactions"("amount");

-- CreateIndex
CREATE INDEX "payment_transactions_reference_idx" ON "payment_transactions"("reference");

-- CreateIndex
CREATE INDEX "payment_transactions_bankAccountId_idx" ON "payment_transactions"("bankAccountId");

-- CreateIndex
CREATE INDEX "payment_matches_paymentId_idx" ON "payment_matches"("paymentId");

-- CreateIndex
CREATE INDEX "payment_matches_invoiceId_idx" ON "payment_matches"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_matches_status_idx" ON "payment_matches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_matches_paymentId_invoiceId_key" ON "payment_matches"("paymentId", "invoiceId");

-- CreateIndex
CREATE INDEX "tenants_phone_idx" ON "tenants"("phone");

-- CreateIndex
CREATE INDEX "tenants_email_idx" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_lineUserId_key" ON "tenants"("lineUserId");

-- CreateIndex
CREATE INDEX "room_tenants_roomNo_idx" ON "room_tenants"("roomNo");

-- CreateIndex
CREATE INDEX "room_tenants_tenantId_idx" ON "room_tenants"("tenantId");

-- CreateIndex
CREATE INDEX "room_tenants_role_idx" ON "room_tenants"("role");

-- CreateIndex
CREATE UNIQUE INDEX "room_tenants_roomNo_tenantId_key" ON "room_tenants"("roomNo", "tenantId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_primaryTenantId_idx" ON "contracts"("primaryTenantId");

-- CreateIndex
CREATE INDEX "contracts_startDate_idx" ON "contracts"("startDate");

-- CreateIndex
CREATE INDEX "contracts_endDate_idx" ON "contracts"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_roomNo_status_key" ON "contracts"("roomNo", "status");

-- CreateIndex
CREATE UNIQUE INDEX "line_users_lineUserId_key" ON "line_users"("lineUserId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_idx" ON "conversations"("tenantId");

-- CreateIndex
CREATE INDEX "conversations_roomNo_idx" ON "conversations"("roomNo");

-- CreateIndex
CREATE INDEX "conversations_unreadCount_idx" ON "conversations"("unreadCount");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_lineUserId_key" ON "conversations"("lineUserId");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- CreateIndex
CREATE INDEX "messages_direction_idx" ON "messages"("direction");

-- CreateIndex
CREATE INDEX "messages_sentAt_idx" ON "messages"("sentAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_sentAt_idx" ON "messages"("conversationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "messages_lineMessageId_key" ON "messages"("lineMessageId");

-- CreateIndex
CREATE INDEX "notifications_roomNo_idx" ON "notifications"("roomNo");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_scheduledAt_idx" ON "notifications"("scheduledAt");

-- CreateIndex
CREATE INDEX "message_templates_type_idx" ON "message_templates"("type");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_files_storageKey_key" ON "uploaded_files"("storageKey");

-- CreateIndex
CREATE INDEX "uploaded_files_createdAt_idx" ON "uploaded_files"("createdAt");

-- CreateIndex
CREATE INDEX "maintenance_tickets_roomNo_idx" ON "maintenance_tickets"("roomNo");

-- CreateIndex
CREATE INDEX "maintenance_tickets_tenantId_idx" ON "maintenance_tickets"("tenantId");

-- CreateIndex
CREATE INDEX "maintenance_tickets_status_idx" ON "maintenance_tickets"("status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_priority_idx" ON "maintenance_tickets"("priority");

-- CreateIndex
CREATE INDEX "maintenance_comments_ticketId_idx" ON "maintenance_comments"("ticketId");

-- CreateIndex
CREATE INDEX "maintenance_attachments_ticketId_idx" ON "maintenance_attachments"("ticketId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "configs_key_key" ON "configs"("key");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_idx" ON "outbox_events"("processedAt");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON "outbox_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "outbox_events_processedAt_createdAt_idx" ON "outbox_events"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_eventType_idx" ON "outbox_events"("eventType");

-- CreateIndex
CREATE INDEX "outbox_events_retryCount_idx" ON "outbox_events"("retryCount");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role");

-- CreateIndex
CREATE INDEX "admin_users_isActive_idx" ON "admin_users"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "staff_registration_requests_status_idx" ON "staff_registration_requests"("status");

-- CreateIndex
CREATE INDEX "staff_registration_requests_createdAt_idx" ON "staff_registration_requests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_registration_requests_username_status_key" ON "staff_registration_requests"("username", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_registration_requests_email_status_key" ON "staff_registration_requests"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_registrations_lineUserId_key" ON "tenant_registrations"("lineUserId");

-- CreateIndex
CREATE INDEX "tenant_registrations_status_idx" ON "tenant_registrations"("status");

-- CreateIndex
CREATE INDEX "tenant_registrations_lineUserId_idx" ON "tenant_registrations"("lineUserId");

-- CreateIndex
CREATE INDEX "document_templates_type_idx" ON "document_templates"("type");

-- CreateIndex
CREATE INDEX "document_templates_status_idx" ON "document_templates"("status");

-- CreateIndex
CREATE INDEX "document_templates_type_status_idx" ON "document_templates"("type", "status");

-- CreateIndex
CREATE INDEX "document_template_versions_templateId_status_idx" ON "document_template_versions"("templateId", "status");

-- CreateIndex
CREATE INDEX "document_template_versions_sourceFileId_idx" ON "document_template_versions"("sourceFileId");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_versions_templateId_version_key" ON "document_template_versions"("templateId", "version");

-- CreateIndex
CREATE INDEX "document_template_field_definitions_templateId_category_sor_idx" ON "document_template_field_definitions"("templateId", "category", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_field_definitions_templateId_key_key" ON "document_template_field_definitions"("templateId", "key");

-- CreateIndex
CREATE INDEX "document_generation_jobs_templateId_createdAt_idx" ON "document_generation_jobs"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "document_generation_jobs_templateVersionId_idx" ON "document_generation_jobs"("templateVersionId");

-- CreateIndex
CREATE INDEX "document_generation_jobs_billingPeriodId_idx" ON "document_generation_jobs"("billingPeriodId");

-- CreateIndex
CREATE INDEX "document_generation_jobs_status_idx" ON "document_generation_jobs"("status");

-- CreateIndex
CREATE INDEX "document_generation_targets_status_idx" ON "document_generation_targets"("status");

-- CreateIndex
CREATE INDEX "document_generation_targets_generatedDocumentId_idx" ON "document_generation_targets"("generatedDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_generation_targets_jobId_roomNo_key" ON "document_generation_targets"("jobId", "roomNo");

-- CreateIndex
CREATE INDEX "generated_documents_templateId_generatedAt_idx" ON "generated_documents"("templateId", "generatedAt");

-- CreateIndex
CREATE INDEX "generated_documents_templateVersionId_idx" ON "generated_documents"("templateVersionId");

-- CreateIndex
CREATE INDEX "generated_documents_roomNo_year_month_idx" ON "generated_documents"("roomNo", "year", "month");

-- CreateIndex
CREATE INDEX "generated_documents_billingPeriodId_idx" ON "generated_documents"("billingPeriodId");

-- CreateIndex
CREATE INDEX "generated_documents_roomBillingId_idx" ON "generated_documents"("roomBillingId");

-- CreateIndex
CREATE INDEX "generated_documents_status_idx" ON "generated_documents"("status");

-- CreateIndex
CREATE INDEX "generated_document_files_uploadedFileId_idx" ON "generated_document_files"("uploadedFileId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_document_files_generatedDocumentId_role_key" ON "generated_document_files"("generatedDocumentId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "_InvoiceToPayment_AB_unique" ON "_InvoiceToPayment"("A", "B");

-- CreateIndex
CREATE INDEX "_InvoiceToPayment_B_index" ON "_InvoiceToPayment"("B");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_defaultAccountId_fkey" FOREIGN KEY ("defaultAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_defaultRuleCode_fkey" FOREIGN KEY ("defaultRuleCode") REFERENCES "billing_rules"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_billings" ADD CONSTRAINT "room_billings_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_billings" ADD CONSTRAINT "room_billings_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_billings" ADD CONSTRAINT "room_billings_ruleCode_fkey" FOREIGN KEY ("ruleCode") REFERENCES "billing_rules"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_roomBillingId_fkey" FOREIGN KEY ("roomBillingId") REFERENCES "room_billings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_tenants" ADD CONSTRAINT "room_tenants_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_tenants" ADD CONSTRAINT "room_tenants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_primaryTenantId_fkey" FOREIGN KEY ("primaryTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lineUserId_fkey" FOREIGN KEY ("lineUserId") REFERENCES "line_users"("lineUserId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_comments" ADD CONSTRAINT "maintenance_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "document_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_versions" ADD CONSTRAINT "document_template_versions_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_template_field_definitions" ADD CONSTRAINT "document_template_field_definitions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_jobs" ADD CONSTRAINT "document_generation_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_jobs" ADD CONSTRAINT "document_generation_jobs_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "document_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_jobs" ADD CONSTRAINT "document_generation_jobs_bundleFileId_fkey" FOREIGN KEY ("bundleFileId") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_targets" ADD CONSTRAINT "document_generation_targets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "document_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_targets" ADD CONSTRAINT "document_generation_targets_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_targets" ADD CONSTRAINT "document_generation_targets_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_targets" ADD CONSTRAINT "document_generation_targets_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_targets" ADD CONSTRAINT "document_generation_targets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "document_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "document_generation_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_files" ADD CONSTRAINT "generated_document_files_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "generated_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_document_files" ADD CONSTRAINT "generated_document_files_uploadedFileId_fkey" FOREIGN KEY ("uploadedFileId") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceToPayment" ADD CONSTRAINT "_InvoiceToPayment_A_fkey" FOREIGN KEY ("A") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_InvoiceToPayment" ADD CONSTRAINT "_InvoiceToPayment_B_fkey" FOREIGN KEY ("B") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

