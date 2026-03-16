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

-- AlterEnum
ALTER TYPE "DocumentTemplateType" ADD VALUE 'PAYMENT_NOTICE';
ALTER TYPE "DocumentTemplateType" ADD VALUE 'GENERAL_NOTICE';

-- AlterTable
ALTER TABLE "document_templates"
ADD COLUMN "activeVersionId" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "createdById" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "updatedById" TEXT;

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
    "billingCycleId" TEXT,
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
    "roomId" TEXT NOT NULL,
    "billingRecordId" TEXT,
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
    "roomId" TEXT NOT NULL,
    "buildingId" TEXT,
    "billingCycleId" TEXT,
    "billingRecordId" TEXT,
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

-- CreateIndex
CREATE INDEX "document_template_versions_templateId_status_idx" ON "document_template_versions"("templateId", "status");

-- CreateIndex
CREATE INDEX "document_template_versions_sourceFileId_idx" ON "document_template_versions"("sourceFileId");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_versions_templateId_version_key" ON "document_template_versions"("templateId", "version");

-- CreateIndex
CREATE INDEX "document_template_field_definitions_templateId_category_sortOrder_idx" ON "document_template_field_definitions"("templateId", "category", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "document_template_field_definitions_templateId_key_key" ON "document_template_field_definitions"("templateId", "key");

-- CreateIndex
CREATE INDEX "document_generation_jobs_templateId_createdAt_idx" ON "document_generation_jobs"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "document_generation_jobs_templateVersionId_idx" ON "document_generation_jobs"("templateVersionId");

-- CreateIndex
CREATE INDEX "document_generation_jobs_billingCycleId_idx" ON "document_generation_jobs"("billingCycleId");

-- CreateIndex
CREATE INDEX "document_generation_jobs_status_idx" ON "document_generation_jobs"("status");

-- CreateIndex
CREATE INDEX "document_generation_targets_status_idx" ON "document_generation_targets"("status");

-- CreateIndex
CREATE INDEX "document_generation_targets_generatedDocumentId_idx" ON "document_generation_targets"("generatedDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_generation_targets_jobId_roomId_key" ON "document_generation_targets"("jobId", "roomId");

-- CreateIndex
CREATE INDEX "generated_documents_templateId_generatedAt_idx" ON "generated_documents"("templateId", "generatedAt");

-- CreateIndex
CREATE INDEX "generated_documents_templateVersionId_idx" ON "generated_documents"("templateVersionId");

-- CreateIndex
CREATE INDEX "generated_documents_roomId_year_month_idx" ON "generated_documents"("roomId", "year", "month");

-- CreateIndex
CREATE INDEX "generated_documents_billingCycleId_idx" ON "generated_documents"("billingCycleId");

-- CreateIndex
CREATE INDEX "generated_documents_billingRecordId_idx" ON "generated_documents"("billingRecordId");

-- CreateIndex
CREATE INDEX "generated_documents_status_idx" ON "generated_documents"("status");

-- CreateIndex
CREATE INDEX "generated_document_files_uploadedFileId_idx" ON "generated_document_files"("uploadedFileId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_document_files_generatedDocumentId_role_key" ON "generated_document_files"("generatedDocumentId", "role");

-- CreateIndex
CREATE INDEX "document_templates_status_idx" ON "document_templates"("status");

-- CreateIndex
CREATE INDEX "document_templates_type_status_idx" ON "document_templates"("type", "status");

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
ALTER TABLE "document_generation_jobs" ADD CONSTRAINT "document_generation_jobs_billingCycleId_fkey" FOREIGN KEY ("billingCycleId") REFERENCES "billing_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_jobs" ADD CONSTRAINT "document_generation_jobs_bundleFileId_fkey" FOREIGN KEY ("bundleFileId") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_targets" ADD CONSTRAINT "document_generation_targets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "document_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_targets" ADD CONSTRAINT "document_generation_targets_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_generation_targets" ADD CONSTRAINT "document_generation_targets_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "billing_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_billingCycleId_fkey" FOREIGN KEY ("billingCycleId") REFERENCES "billing_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_billingRecordId_fkey" FOREIGN KEY ("billingRecordId") REFERENCES "billing_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
