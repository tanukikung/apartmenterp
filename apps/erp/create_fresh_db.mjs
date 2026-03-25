/**
 * create_fresh_db.mjs
 *
 * Creates a fresh test PostgreSQL database for local development/testing.
 * Reads connection params from DATABASE_URL env var (no hardcoded credentials).
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:password@localhost:5432/postgres" node create_fresh_db.mjs
 *
 * Or from .env:
 *   cp .env.example .env  # fill in your values
 *   node -r dotenv/config create_fresh_db.mjs
 */
import pkg from 'pg';
const { Client } = pkg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL environment variable is required.');
  console.error('  DATABASE_URL="postgresql://..." node create_fresh_db.mjs');
  process.exit(1);
}

const c = new Client(url);
await c.connect();

const freshDb = process.env.TEST_DB_NAME ?? 'test_fresh_proof';

try {
  await c.query(`DROP DATABASE IF EXISTS ${freshDb}`);
  console.log(`Dropped: ${freshDb} (if existed)`);
} catch (e) {
  console.log('drop:', e.message);
}

await c.query(`CREATE DATABASE ${freshDb}`);
console.log(`Created: ${freshDb}`);

await c.end();
