ALTER TABLE "billing_periods"
ADD COLUMN IF NOT EXISTS "gracePeriodDays" INTEGER DEFAULT 0;

UPDATE "billing_periods"
SET "gracePeriodDays" = 0
WHERE "gracePeriodDays" IS NULL;

ALTER TABLE "billing_periods"
ALTER COLUMN "gracePeriodDays" SET DEFAULT 0,
ALTER COLUMN "gracePeriodDays" SET NOT NULL;
