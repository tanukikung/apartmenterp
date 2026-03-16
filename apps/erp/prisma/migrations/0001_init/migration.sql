-- Baseline schema generated from current Prisma datamodel.
-- Subsequent migrations in this directory are retained for history but are no-ops.

CREATE TYPE "RoomStatus" AS ENUM ('VACANT', 'OCCUPIED', 'MAINTENANCE');
CREATE TYPE "TenantRole" AS ENUM ('PRIMARY', 'SECONDARY');
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED');
CREATE TYPE "BillingStatus" AS ENUM ('DRAFT', 'LOCKED', 'INVOICED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'VIEWED', 'PAID', 'OVERDUE');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'MATCHED', 'CONFIRMED', 'REJECTED');
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'AUTO_MATCHED', 'NEED_REVIEW', 'CONFIRMED', 'REJECTED');
CREATE TYPE "PaymentMatchStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
CREATE TYPE "MatchConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "MessageDirection" AS ENUM ('INCOMING', 'OUTGOING');
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'STICKER', 'SYSTEM');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');
CREATE TYPE "NotificationType" AS ENUM ('INVOICE_REMINDER', 'PAYMENT_REMINDER', 'NOTICE', 'CUSTOM');
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE', 'CLOSED');
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'STAFF');
CREATE TYPE "StaffRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "totalFloors" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'VACANT',
    "maxResidents" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "room_tenants" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "moveInDate" TIMESTAMP(3) NOT NULL,
    "moveOutDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "primaryTenantId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "monthlyRent" DECIMAL(10,2) NOT NULL,
    "deposit" DECIMAL(10,2),
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "terminationDate" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_item_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "defaultAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_item_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_records" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "billingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "overdueDay" INTEGER NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_items" (
    "id" TEXT NOT NULL,
    "billingRecordId" TEXT NOT NULL,
    "itemTypeId" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "billing_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "billingRecordId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "viewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_versions" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "billingRecordId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "changeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_changes" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "previousInvoiceId" TEXT,
    "billingItemId" TEXT,
    "fieldChanged" TEXT NOT NULL,
    "oldValue" TEXT NOT NULL,
    "newValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_changes_pkey" PRIMARY KEY ("id")
);

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "tenantId" TEXT,
    "roomId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "roomId" TEXT NOT NULL,
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

CREATE TABLE "maintenance_tickets" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
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

CREATE TABLE "maintenance_comments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "maintenance_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "maintenance_attachments" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "maintenance_attachments_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "configs_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX "floors_buildingId_floorNumber_key" ON "floors"("buildingId", "floorNumber");
CREATE INDEX "rooms_status_idx" ON "rooms"("status");
CREATE UNIQUE INDEX "rooms_floorId_roomNumber_key" ON "rooms"("floorId", "roomNumber");
CREATE INDEX "tenants_phone_idx" ON "tenants"("phone");
CREATE INDEX "tenants_email_idx" ON "tenants"("email");
CREATE UNIQUE INDEX "tenants_lineUserId_key" ON "tenants"("lineUserId");
CREATE INDEX "room_tenants_roomId_idx" ON "room_tenants"("roomId");
CREATE INDEX "room_tenants_tenantId_idx" ON "room_tenants"("tenantId");
CREATE INDEX "room_tenants_role_idx" ON "room_tenants"("role");
CREATE UNIQUE INDEX "room_tenants_roomId_tenantId_key" ON "room_tenants"("roomId", "tenantId");
CREATE INDEX "contracts_status_idx" ON "contracts"("status");
CREATE INDEX "contracts_primaryTenantId_idx" ON "contracts"("primaryTenantId");
CREATE INDEX "contracts_startDate_idx" ON "contracts"("startDate");
CREATE INDEX "contracts_endDate_idx" ON "contracts"("endDate");
CREATE UNIQUE INDEX "contracts_roomId_status_key" ON "contracts"("roomId", "status");
CREATE UNIQUE INDEX "billing_item_types_code_key" ON "billing_item_types"("code");
CREATE INDEX "billing_records_roomId_idx" ON "billing_records"("roomId");
CREATE INDEX "billing_records_year_month_idx" ON "billing_records"("year", "month");
CREATE INDEX "billing_records_status_idx" ON "billing_records"("status");
CREATE UNIQUE INDEX "billing_records_roomId_year_month_key" ON "billing_records"("roomId", "year", "month");
CREATE INDEX "billing_items_billingRecordId_idx" ON "billing_items"("billingRecordId");
CREATE INDEX "billing_items_itemTypeId_idx" ON "billing_items"("itemTypeId");
CREATE INDEX "invoices_roomId_idx" ON "invoices"("roomId");
CREATE INDEX "invoices_billingRecordId_idx" ON "invoices"("billingRecordId");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_year_month_idx" ON "invoices"("year", "month");
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");
CREATE INDEX "invoices_roomId_createdAt_idx" ON "invoices"("roomId", "createdAt" DESC);
CREATE UNIQUE INDEX "invoices_roomId_year_month_version_key" ON "invoices"("roomId", "year", "month", "version");
CREATE INDEX "invoice_versions_invoiceId_idx" ON "invoice_versions"("invoiceId");
CREATE UNIQUE INDEX "invoice_versions_invoiceId_version_key" ON "invoice_versions"("invoiceId", "version");
CREATE INDEX "invoice_changes_invoiceId_idx" ON "invoice_changes"("invoiceId");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");
CREATE INDEX "payments_amount_idx" ON "payments"("amount");
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");
CREATE INDEX "payment_transactions_transactionDate_idx" ON "payment_transactions"("transactionDate");
CREATE INDEX "payment_transactions_amount_idx" ON "payment_transactions"("amount");
CREATE INDEX "payment_transactions_reference_idx" ON "payment_transactions"("reference");
CREATE INDEX "payment_matches_paymentId_idx" ON "payment_matches"("paymentId");
CREATE INDEX "payment_matches_invoiceId_idx" ON "payment_matches"("invoiceId");
CREATE INDEX "payment_matches_status_idx" ON "payment_matches"("status");
CREATE UNIQUE INDEX "payment_matches_paymentId_invoiceId_key" ON "payment_matches"("paymentId", "invoiceId");
CREATE UNIQUE INDEX "line_users_lineUserId_key" ON "line_users"("lineUserId");
CREATE INDEX "conversations_tenantId_idx" ON "conversations"("tenantId");
CREATE INDEX "conversations_roomId_idx" ON "conversations"("roomId");
CREATE INDEX "conversations_unreadCount_idx" ON "conversations"("unreadCount");
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");
CREATE UNIQUE INDEX "conversations_lineUserId_key" ON "conversations"("lineUserId");
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");
CREATE INDEX "messages_direction_idx" ON "messages"("direction");
CREATE INDEX "messages_sentAt_idx" ON "messages"("sentAt");
CREATE INDEX "messages_conversationId_sentAt_idx" ON "messages"("conversationId", "sentAt");
CREATE UNIQUE INDEX "messages_lineMessageId_key" ON "messages"("lineMessageId");
CREATE INDEX "notifications_roomId_idx" ON "notifications"("roomId");
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");
CREATE INDEX "notifications_status_idx" ON "notifications"("status");
CREATE INDEX "notifications_scheduledAt_idx" ON "notifications"("scheduledAt");
CREATE UNIQUE INDEX "uploaded_files_storageKey_key" ON "uploaded_files"("storageKey");
CREATE INDEX "uploaded_files_createdAt_idx" ON "uploaded_files"("createdAt");
CREATE INDEX "maintenance_tickets_roomId_idx" ON "maintenance_tickets"("roomId");
CREATE INDEX "maintenance_tickets_tenantId_idx" ON "maintenance_tickets"("tenantId");
CREATE INDEX "maintenance_tickets_status_idx" ON "maintenance_tickets"("status");
CREATE INDEX "maintenance_tickets_priority_idx" ON "maintenance_tickets"("priority");
CREATE INDEX "maintenance_comments_ticketId_idx" ON "maintenance_comments"("ticketId");
CREATE INDEX "maintenance_attachments_ticketId_idx" ON "maintenance_attachments"("ticketId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE UNIQUE INDEX "configs_key_key" ON "configs"("key");
CREATE INDEX "outbox_events_processedAt_idx" ON "outbox_events"("processedAt");
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON "outbox_events"("aggregateType", "aggregateId");
CREATE INDEX "outbox_events_processedAt_createdAt_idx" ON "outbox_events"("processedAt", "createdAt");
CREATE INDEX "outbox_events_eventType_idx" ON "outbox_events"("eventType");
CREATE INDEX "outbox_events_retryCount_idx" ON "outbox_events"("retryCount");
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role");
CREATE INDEX "admin_users_isActive_idx" ON "admin_users"("isActive");
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");
CREATE INDEX "staff_registration_requests_status_idx" ON "staff_registration_requests"("status");
CREATE INDEX "staff_registration_requests_createdAt_idx" ON "staff_registration_requests"("createdAt");
CREATE UNIQUE INDEX "staff_registration_requests_username_status_key" ON "staff_registration_requests"("username", "status");
CREATE UNIQUE INDEX "staff_registration_requests_email_status_key" ON "staff_registration_requests"("email", "status");

ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_tenants" ADD CONSTRAINT "room_tenants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_tenants" ADD CONSTRAINT "room_tenants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_primaryTenantId_fkey" FOREIGN KEY ("primaryTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "billing_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_itemTypeId_fkey" FOREIGN KEY ("itemTypeId") REFERENCES "billing_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "billing_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_versions" ADD CONSTRAINT "invoice_versions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_changes" ADD CONSTRAINT "invoice_changes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lineUserId_fkey" FOREIGN KEY ("lineUserId") REFERENCES "line_users"("lineUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_comments" ADD CONSTRAINT "maintenance_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
