/**
 * Safe migrate deploy wrapper.
 *
 * Prisma does not generate "down" migrations, so the safest rollback path
 * is a pre-migrate backup. This script:
 *   1. Runs a pg_dump via scripts/backup-db.ts
 *   2. Records the backup file path (and S3 URI if configured) in a marker
 *      file so ops knows which backup to restore on failure
 *   3. Runs `prisma migrate deploy`
 *   4. On failure, prints the restore command and exits non-zero
 *
 * Usage:   npx tsx scripts/migrate-safe.ts
 * Rollback: npx tsx scripts/restore-db.ts <backup-file>
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runBackup } from './backup-db';
import { resolveBackupDir } from '../src/lib/runtime-paths';

async function main(): Promise<void> {
  console.log('[migrate-safe] Taking pre-migration backup...');
  const { s3Uri } = await runBackup();

  // runBackup writes into resolveBackupDir() — pick the newest file as the
  // one we just created.
  const dir = resolveBackupDir();
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const full = path.join(dir, e.name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  const latest = entries[0]?.full;

  const markerPath = path.join(dir, '.last-pre-migrate-backup');
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        backupFile: latest,
        s3Uri: s3Uri ?? null,
        takenAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`[migrate-safe] Backup ready: ${latest}`);
  if (s3Uri) console.log(`[migrate-safe] S3 copy: ${s3Uri}`);

  console.log('[migrate-safe] Running prisma migrate deploy...');
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    console.error('\n[migrate-safe] Migration FAILED.');
    console.error('[migrate-safe] Restore with:');
    console.error(`    npx tsx scripts/restore-db.ts "${latest}"`);
    process.exit(result.status ?? 1);
  }

  console.log('[migrate-safe] Migration succeeded.');
}

main().catch((err) => {
  console.error('[migrate-safe] Unexpected error:', err);
  process.exit(1);
});
