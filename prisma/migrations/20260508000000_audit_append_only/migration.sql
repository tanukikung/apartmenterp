-- Audit Log Append-Only Enforcement + Hash Chain Fields
-- Prevents UPDATE and DELETE on audit_logs and billing_audit_logs tables.
-- Adds sequenceNum, prevHash, eventHash for tamper-evident hash chaining.

-- 1. Add new columns for hash chain (allows existing data to migrate)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS sequence_num BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_hash TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id TEXT;   -- rename user_id → actor_id (consistent naming)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role TEXT;  -- new field

ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS sequence_num BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1);
ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE billing_audit_logs ADD COLUMN IF NOT EXISTS event_hash TEXT;

-- 2. Populate sequence_num from existing rows (maintains order by created_at)
DO $$
DECLARE
  r record;
  seq bigint := 0;
BEGIN
  FOR r IN SELECT id FROM audit_logs ORDER BY created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE audit_logs SET sequence_num = seq WHERE id = r.id;
  END LOOP;
END;
$$;

DO $$
DECLARE
  r record;
  seq bigint := 0;
BEGIN
  FOR r IN SELECT id FROM billing_audit_logs ORDER BY created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE billing_audit_logs SET sequence_num = seq WHERE id = r.id;
  END LOOP;
END;
$$;

-- 3. Backfill event_hash for existing records (simple hash of id+created_at for historical records)
UPDATE audit_logs SET event_hash = encode(sha256((id || created_at::text)::bytea), 'hex')
 WHERE event_hash IS NULL;

UPDATE billing_audit_logs SET event_hash = encode(sha256((id || created_at::text)::bytea), 'hex')
 WHERE event_hash IS NULL;

-- 4. Create unique indexes on sequence_num
CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_seq_unique ON audit_logs(sequence_num);
CREATE UNIQUE INDEX IF NOT EXISTS billing_audit_logs_seq_unique ON billing_audit_logs(sequence_num);

-- 5. Make sequence_num NOT NULL after population
ALTER TABLE audit_logs ALTER COLUMN sequence_num SET NOT NULL;
ALTER TABLE billing_audit_logs ALTER COLUMN sequence_num SET NOT NULL;

-- 6. Trigger function to block UPDATE/DELETE on audit tables
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_LOGS_ARE_IMMUTABLE'
  USING HINT = 'Attempted to modify audit log entry id=' || OLD.id;
END;
$$ LANGUAGE plpgsql;

-- Apply append-only trigger to audit_logs
CREATE TRIGGER audit_logs_prevent_mod
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- Apply append-only trigger to billing_audit_logs
CREATE TRIGGER billing_audit_logs_prevent_mod
BEFORE UPDATE OR DELETE ON billing_audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
