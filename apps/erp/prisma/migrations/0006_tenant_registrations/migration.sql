-- Migration: 0006_tenant_registrations
-- Adds TenantRegistrationStatus enum and tenant_registrations table.
-- This supports the LINE tenant registration workflow where prospective
-- tenants register via LINE bot and admins review/approve/reject requests.

-- CreateEnum
CREATE TYPE "TenantRegistrationStatus" AS ENUM (
  'PENDING',
  'CORRECTION_REQUESTED',
  'APPROVED',
  'REJECTED'
);

-- CreateTable
CREATE TABLE "tenant_registrations" (
    "id"               TEXT NOT NULL,
    "lineUserId"       TEXT NOT NULL,
    "lineDisplayName"  TEXT,
    "phone"            TEXT,
    "claimedRoom"      TEXT,
    "status"           "TenantRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason"  TEXT,
    "correctionNote"   TEXT,
    "resolvedRoomId"   TEXT,
    "resolvedTenantId" TEXT,
    "reviewedById"     TEXT,
    "reviewedAt"       TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique LINE user ID per registration
CREATE UNIQUE INDEX "tenant_registrations_lineUserId_key"
    ON "tenant_registrations"("lineUserId");

-- CreateIndex: filter by status (admin queue views)
CREATE INDEX "tenant_registrations_status_idx"
    ON "tenant_registrations"("status");

-- CreateIndex: lookup by LINE user ID
CREATE INDEX "tenant_registrations_lineUserId_idx"
    ON "tenant_registrations"("lineUserId");
