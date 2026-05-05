/**
 * Direct Prisma cleanup for E2E test isolation.
 * Bypasses API auth by running directly against the database.
 * Clears all test artifacts so rooms are VACANT before each test run.
 *
 * HARD GUARD: This script DELETES data.  It must NEVER run in production.
 * Both NODE_ENV=test AND ALLOW_DB_RESET=true must be set, or the script
 * exits immediately with no side effects.
 */
if (process.env.NODE_ENV !== 'test' || process.env.ALLOW_DB_RESET !== 'true') {
  console.error(
    '[e2e-cleanup] BLOCKED: This script can only run with NODE_ENV=test AND ALLOW_DB_RESET=true.\n' +
    'This is a safety guard to prevent accidental data deletion in production.\n' +
    'If you are running E2E tests, this should be handled automatically by global-setup.ts.\n' +
    'To run manually: NODE_ENV=test ALLOW_DB_RESET=true npx tsx scripts/e2e-cleanup.ts'
  );
  process.exit(1);
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanup() {
  console.log('[e2e-cleanup] Starting database cleanup...');

  // Delete in dependency order (respecting foreign keys)
  await prisma.roomTenant.deleteMany({});
  console.log('[e2e-cleanup] Cleared RoomTenant records');

  await prisma.contract.deleteMany({});
  console.log('[e2e-cleanup] Cleared Contract records');

  await prisma.invoice.deleteMany({});
  console.log('[e2e-cleanup] Cleared Invoice records');

  await prisma.payment.deleteMany({});
  console.log('[e2e-cleanup] Cleared Payment records');

  await prisma.auditLog.deleteMany({});

  console.log('[e2e-cleanup] Done.');
}

cleanup()
  .catch((err) => {
    console.error('[e2e-cleanup] FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());