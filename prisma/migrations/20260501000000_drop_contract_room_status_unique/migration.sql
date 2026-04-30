-- HIGH-09 fix: Drop the old @@unique([roomNo, status]) constraint
-- which blocks multiple TERMINATED/EXPIRED contracts per room.
-- The partial unique index Contract_active_room_unique (where status='ACTIVE')
-- was already created in migration 20260430000002_add_contract_active_partial_unique_idx.
DROP INDEX IF EXISTS "Contract_roomNo_status_key";
