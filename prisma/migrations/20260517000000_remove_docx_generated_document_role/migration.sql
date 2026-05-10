/*
  Remove legacy DOCX generated-document artifacts.

  We no longer generate DOCX outputs. Any historical DOCX file links under
  generated documents are removed before shrinking the enum so the migration
  can succeed without manual cleanup.
*/

DELETE FROM "uploaded_files"
WHERE "id" IN (
  SELECT "uploadedFileId"
  FROM "generated_document_files"
  WHERE "role" = 'DOCX'
);

ALTER TYPE "GeneratedDocumentFileRole" RENAME TO "GeneratedDocumentFileRole_old";

CREATE TYPE "GeneratedDocumentFileRole" AS ENUM ('SOURCE_HTML', 'PDF', 'ZIP_BUNDLE', 'PREVIEW');

ALTER TABLE "generated_document_files"
ALTER COLUMN "role" TYPE "GeneratedDocumentFileRole"
USING ("role"::text::"GeneratedDocumentFileRole");

DROP TYPE "GeneratedDocumentFileRole_old";
