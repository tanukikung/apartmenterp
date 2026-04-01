-- CreateEnum
CREATE TYPE "delivery_channel" AS ENUM ('LINE');

-- CreateEnum
CREATE TYPE "delivery_order_status" AS ENUM ('DRAFT', 'SENDING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "delivery_item_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "registration_step" AS ENUM ('AWAITING_ROOM', 'AWAITING_NAME', 'AWAITING_PHONE', 'COMPLETED');

-- AlterTable
ALTER TABLE "tenant_registrations" ADD COLUMN     "registrationStep" "registration_step";

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" TEXT NOT NULL,
    "channel" "delivery_channel" NOT NULL DEFAULT 'LINE',
    "documentType" "DocumentTemplateType" NOT NULL,
    "description" TEXT,
    "year" INTEGER,
    "month" INTEGER,
    "floorNumber" INTEGER,
    "scopeRoomNos" TEXT[],
    "status" "delivery_order_status" NOT NULL DEFAULT 'DRAFT',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_order_items" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "roomNo" TEXT NOT NULL,
    "tenantId" TEXT,
    "generatedDocumentId" TEXT,
    "invoiceId" TEXT,
    "recipientRef" TEXT,
    "status" "delivery_item_status" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "delivery_orders_status_idx" ON "delivery_orders"("status");

-- CreateIndex
CREATE INDEX "delivery_orders_year_month_idx" ON "delivery_orders"("year", "month");

-- CreateIndex
CREATE INDEX "delivery_orders_createdAt_idx" ON "delivery_orders"("createdAt");

-- CreateIndex
CREATE INDEX "delivery_order_items_deliveryOrderId_idx" ON "delivery_order_items"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "delivery_order_items_roomNo_idx" ON "delivery_order_items"("roomNo");

-- CreateIndex
CREATE INDEX "delivery_order_items_status_idx" ON "delivery_order_items"("status");

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_roomNo_fkey" FOREIGN KEY ("roomNo") REFERENCES "rooms"("roomNo") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_generatedDocumentId_fkey" FOREIGN KEY ("generatedDocumentId") REFERENCES "generated_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
