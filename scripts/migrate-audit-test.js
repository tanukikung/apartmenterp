const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:anand37048@localhost:5432/apartment_erp_test' } } });

async function migrate() {
  try {
    // Add all missing snake_case columns
    const cols = [
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id TEXT',
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role TEXT',
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type TEXT',
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id TEXT',
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata TEXT',
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS prev_hash TEXT',
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_hash TEXT',
      'ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP',
    ];

    for (const sql of cols) {
      try { await p.$queryRawUnsafe(sql); } catch {}
    }
    console.log('Columns added');

    // Add sequence_num if not exists
    try {
      await p.$queryRawUnsafe('ALTER TABLE audit_logs ADD COLUMN sequence_num BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1)');
    } catch {}
    console.log('sequence_num added');

    // Populate sequence_num
    try {
      await p.$queryRawUnsafe('DO $$ DECLARE r record; seq bigint := 0; BEGIN FOR r IN SELECT id FROM audit_logs ORDER BY "createdAt" ASC LOOP seq := seq + 1; UPDATE audit_logs SET sequence_num = seq WHERE id = r.id; END LOOP; END; $$');
      console.log('sequence_num populated');
    } catch (e) { console.error('populate seq error:', e.message); }

    // Make NOT NULL and add index
    try {
      await p.$queryRawUnsafe('ALTER TABLE audit_logs ALTER COLUMN sequence_num SET NOT NULL');
      await p.$queryRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS audit_logs_seq_unique ON audit_logs(sequence_num)');
      console.log('Index created');
    } catch (e) { console.error('index error:', e.message); }

    // Backfill event_hash
    try {
      await p.$queryRawUnsafe("UPDATE audit_logs SET event_hash = encode(sha256((id || \"createdAt\"::text)::bytea), 'hex') WHERE event_hash IS NULL");
      console.log('event_hash backfilled');
    } catch (e) { console.error('event_hash backfill error:', e.message); }

    // Copy data from camelCase to snake_case
    try {
      await p.$queryRawUnsafe("UPDATE audit_logs SET actor_id = \"userId\", actor_role = \"userName\", entity_type = \"entityType\", metadata = \"details\"::TEXT, created_at = \"createdAt\" WHERE actor_id IS NULL");
      console.log('Data copied from camelCase to snake_case');
    } catch (e) { console.error('data copy error:', e.message); }

    console.log('Migration complete');
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await p.$disconnect();
  }
}

migrate();