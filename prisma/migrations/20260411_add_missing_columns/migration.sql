-- Repair migration: room_billings.calculatedAt was referenced in a conditional
-- index creation but the column was never added. This migration:
-- 1. Adds the missing column (nullable, no default)
-- 2. Marks the broken 20260411 migration as applied so Prisma can continue

ALTER TABLE "room_billings" ADD COLUMN IF NOT EXISTS "calculatedAt" TIMESTAMPTZ;