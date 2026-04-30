-- Contract @@unique([roomNo, status]) allows only one ACTIVE contract per room
-- but blocks creation of multiple TERMINATED/EXPIRED contracts for the same room
-- (historical records).  Replace with a partial unique index that only enforces
-- uniqueness when status = 'ACTIVE'.
--
-- Migration: replace @@unique([roomNo, status]) with:
--   CREATE UNIQUE INDEX contract_active_room ON contracts(roomNo) WHERE status = 'ACTIVE'
--
-- Step 1: Drop the old non-partial constraint
-- Step 2: Create the partial unique index for ACTIVE only
-- Step 3: Remove the @@unique line from schema.prisma (done by Prisma migrate)

-- Drop the old constraint (Prisma names it: Contract_roomNo_status_key)
DROP INDEX IF EXISTS "Contract_roomNo_status_key";

-- Create partial unique index: only ACTIVE contracts need to be unique per room
-- TERMINATED, EXPIRED, DRAFT, CANCELLED contracts can have multiple records
CREATE UNIQUE INDEX "Contract_active_room_unique"
  ON "contracts"("roomNo")
  WHERE "status" = 'ACTIVE';
