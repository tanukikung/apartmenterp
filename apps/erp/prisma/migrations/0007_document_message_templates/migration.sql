-- Migration: 0007_document_message_templates
-- Adds DocumentTemplateType enum + document_templates table
-- and MessageTemplateType enum + message_templates table.
-- These support the admin UIs for editing reusable document and LINE message templates.

-- CreateEnum
CREATE TYPE "DocumentTemplateType" AS ENUM (
  'INVOICE',
  'CONTRACT',
  'RECEIPT',
  'NOTICE',
  'OTHER'
);

-- CreateEnum
CREATE TYPE "MessageTemplateType" AS ENUM (
  'INVOICE_SEND',
  'PAYMENT_REMINDER',
  'OVERDUE_NOTICE',
  'CUSTOM'
);

-- CreateTable: document_templates
CREATE TABLE "document_templates" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      "DocumentTemplateType" NOT NULL DEFAULT 'INVOICE',
    "subject"   TEXT,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_templates_type_idx" ON "document_templates"("type");

-- CreateTable: message_templates
CREATE TABLE "message_templates" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "type"      "MessageTemplateType" NOT NULL DEFAULT 'CUSTOM',
    "body"      TEXT NOT NULL,
    "variables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_templates_type_idx" ON "message_templates"("type");
