-- Migration: 0009_invoice_delivery_template_snapshot
-- Adds documentTemplateId + documentTemplateHash to invoice_deliveries so that
-- the DocumentTemplate that was active at delivery creation time is captured as
-- an immutable snapshot.  Template edits after the fact do NOT change these fields.

ALTER TABLE "invoice_deliveries"
  ADD COLUMN "documentTemplateId"   TEXT,
  ADD COLUMN "documentTemplateHash" TEXT;

CREATE INDEX "invoice_deliveries_documentTemplateId_idx"
  ON "invoice_deliveries"("documentTemplateId");
