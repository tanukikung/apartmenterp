ALTER TABLE "import_batches"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) DEFAULT NOW();

UPDATE "import_batches"
SET "updatedAt" = COALESCE("updatedAt", "createdAt", NOW())
WHERE "updatedAt" IS NULL;

ALTER TABLE "import_batches"
ALTER COLUMN "updatedAt" SET DEFAULT NOW(),
ALTER COLUMN "updatedAt" SET NOT NULL;
