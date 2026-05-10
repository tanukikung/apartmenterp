ALTER TABLE "uploaded_files"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) DEFAULT NOW();

UPDATE "uploaded_files"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", NOW())
WHERE "updatedAt" IS NULL;

ALTER TABLE "uploaded_files"
ALTER COLUMN "updatedAt" SET DEFAULT NOW(),
ALTER COLUMN "updatedAt" SET NOT NULL;
