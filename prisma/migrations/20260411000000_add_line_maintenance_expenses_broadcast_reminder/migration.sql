-- Migration: Add line_maintenance_states, expenses, broadcasts, reminders, and related fields
-- Created to capture db push changes that were applied without migration files

-- CreateEnum: UploadedFileStatus
CREATE TYPE "UploadedFileStatus" AS ENUM ('ACTIVE', 'PENDING_ARCHIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum: BroadcastStatus
CREATE TYPE "BroadcastStatus" AS ENUM ('PENDING', 'SENDING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum: BroadcastTarget
CREATE TYPE "BroadcastTarget" AS ENUM ('ALL', 'FLOORS', 'ROOMS');

-- CreateEnum: ReminderPriority
CREATE TYPE "ReminderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum: ReminderAppliesTo
CREATE TYPE "ReminderAppliesTo" AS ENUM ('ALL', 'OVERDUE', 'DUE_SOON');

-- CreateEnum: ExpenseCategory
CREATE TYPE "ExpenseCategory" AS ENUM ('CLEANING', 'REPAIR', 'UTILITY', 'STAFF_SALARY', 'MANAGEMENT', 'OTHER');

-- CreateEnum: MoveOutStatus
CREATE TYPE "MoveOutStatus" AS ENUM ('PENDING', 'INSPECTION_DONE', 'DEPOSIT_CALCULATED', 'CONFIRMED', 'REFUNDED', 'CANCELLED');

-- CreateEnum: MoveOutItemCondition
CREATE TYPE "MoveOutItemCondition" AS ENUM ('GOOD', 'FAIR', 'DAMAGED', 'MISSING');

-- AlterTable: Add maxResidents to rooms
ALTER TABLE "rooms" ADD COLUMN "maxResidents" INTEGER NOT NULL DEFAULT 2;

-- AlterTable: Add remark to payments
ALTER TABLE "payments" ADD COLUMN "remark" TEXT;

-- CreateTable: line_maintenance_states
CREATE TABLE "line_maintenance_states" (
    "id" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "currentStep" TEXT NOT NULL,
    "requestData" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "line_maintenance_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: line_maintenance_states_lineUserId_idx
CREATE UNIQUE INDEX "line_maintenance_states_lineUserId_key" ON "line_maintenance_states"("lineUserId");

-- AddForeignKey: line_maintenance_states_lineUserId_fkey
ALTER TABLE "line_maintenance_states" ADD CONSTRAINT "line_maintenance_states_lineUserId_fkey" FOREIGN KEY ("lineUserId") REFERENCES "line_users"("lineUserId") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: broadcasts
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "target" "BroadcastTarget" NOT NULL DEFAULT 'ALL',
    "targetFloors" INTEGER[],
    "targetRooms" TEXT[],
    "sentBy" TEXT NOT NULL,
    "sentByName" TEXT,
    "sentAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lineMessageId" TEXT,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT,
    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: broadcasts_sentAt_idx
CREATE INDEX "broadcasts_sentAt_idx" ON "broadcasts"("sentAt");

-- CreateIndex: broadcasts_target_idx
CREATE INDEX "broadcasts_target_idx" ON "broadcasts"("target");

-- CreateIndex: broadcasts_status_idx
CREATE INDEX "broadcasts_status_idx" ON "broadcasts"("status");

-- CreateIndex: broadcasts_idempotencyKey_idx
CREATE UNIQUE INDEX "broadcasts_idempotencyKey_idx" ON "broadcasts"("idempotencyKey");

-- CreateTable: reminder_configs
CREATE TABLE "reminder_configs" (
    "id" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "messageTh" TEXT NOT NULL,
    "messageEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" "ReminderPriority" NOT NULL DEFAULT 'NORMAL',
    "appliesTo" "ReminderAppliesTo" NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "reminder_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: reminder_configs_periodDays_idx
CREATE UNIQUE INDEX "reminder_configs_periodDays_key" ON "reminder_configs"("periodDays");

-- CreateIndex: reminder_configs_isActive_idx
CREATE INDEX "reminder_configs_isActive_idx" ON "reminder_configs"("isActive");

-- CreateTable: expenses
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "paidTo" TEXT,
    "receiptNo" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: expenses_category_idx
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex: expenses_date_idx
CREATE INDEX "expenses_date_idx" ON "expenses"("date");

-- CreateIndex: expenses_createdAt_idx
CREATE INDEX "expenses_createdAt_idx" ON "expenses"("createdAt");

-- CreateTable: move_outs
CREATE TABLE "move_outs" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "moveOutDate" DATE NOT NULL,
    "depositAmount" DECIMAL(12,2) NOT NULL,
    "totalDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalRefund" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "MoveOutStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "lineNoticeSentAt" TIMESTAMPTZ,
    "confirmedAt" TIMESTAMPTZ,
    "confirmedBy" TEXT,
    "refundAt" TIMESTAMPTZ,
    "refundBy" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "move_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: move_outs_status_idx
CREATE INDEX "move_outs_status_idx" ON "move_outs"("status");

-- CreateIndex: move_outs_moveOutDate_idx
CREATE INDEX "move_outs_moveOutDate_idx" ON "move_outs"("moveOutDate");

-- CreateIndex: move_outs_contractId_idx
CREATE INDEX "move_outs_contractId_idx" ON "move_outs"("contractId");

-- AddForeignKey: move_outs_contractId_fkey
ALTER TABLE "move_outs" ADD CONSTRAINT "move_outs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON UPDATE CASCADE;

-- CreateTable: move_out_items
CREATE TABLE "move_out_items" (
    "id" TEXT NOT NULL,
    "moveOutId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "condition" "MoveOutItemCondition" NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "move_out_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: move_out_items_moveOutId_idx
CREATE INDEX "move_out_items_moveOutId_idx" ON "move_out_items"("moveOutId");

-- AddForeignKey: move_out_items_moveOutId_fkey
ALTER TABLE "move_out_items" ADD CONSTRAINT "move_out_items_moveOutId_fkey" FOREIGN KEY ("moveOutId") REFERENCES "move_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: uploaded_files_mime_type_idx (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uploaded_files_mime_type_idx') THEN
        CREATE INDEX "uploaded_files_mime_type_idx" ON "uploaded_files"("mimeType");
    END IF;
END $$;

-- CreateIndex: notifications_room_no_status_idx (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'notifications_room_no_status_idx') THEN
        CREATE INDEX "notifications_room_no_status_idx" ON "notifications"("roomNo", "status");
    END IF;
END $$;

-- CreateIndex: room_billings_calculated_at_idx (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'room_billings_calculated_at_idx') THEN
        CREATE INDEX "room_billings_calculated_at_idx" ON "room_billings"("calculatedAt");
    END IF;
END $$;
