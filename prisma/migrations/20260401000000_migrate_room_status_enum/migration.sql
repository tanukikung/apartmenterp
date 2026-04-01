-- Migrate RoomStatus enum from {ACTIVE, INACTIVE} to {VACANT, OCCUPIED, MAINTENANCE, OWNER_USE}
-- Data mapping: ACTIVE → OCCUPIED, INACTIVE → VACANT

-- Step 1: Drop the default value (depends on enum type)
ALTER TABLE "rooms" ALTER COLUMN "roomStatus" DROP DEFAULT;

-- Step 2: Convert column to text temporarily
ALTER TABLE "rooms" ALTER COLUMN "roomStatus" TYPE TEXT;

-- Step 3: Map old values to new values
UPDATE "rooms" SET "roomStatus" = 'OCCUPIED' WHERE "roomStatus" = 'ACTIVE';
UPDATE "rooms" SET "roomStatus" = 'VACANT' WHERE "roomStatus" = 'INACTIVE';

-- Step 4: Drop old enum and create new one
DROP TYPE "RoomStatus";
CREATE TYPE "RoomStatus" AS ENUM ('VACANT', 'OCCUPIED', 'MAINTENANCE', 'OWNER_USE');

-- Step 5: Convert column back to enum
ALTER TABLE "rooms" ALTER COLUMN "roomStatus" TYPE "RoomStatus" USING "roomStatus"::"RoomStatus";

-- Step 6: Set new default
ALTER TABLE "rooms" ALTER COLUMN "roomStatus" SET DEFAULT 'VACANT';
