import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { logger } from '@/lib/utils/logger';

export async function runRestore(filePath: string, databaseUrl: string): Promise<void> {
  await fs.access(filePath);
  const start = Date.now();
  logger.info({ type: 'restore_start', filePath });
  await new Promise<void>((resolve, reject) => {
    const gunzip = spawn(process.platform === 'win32' ? 'gzip.exe' : 'gzip', ['-d', '-c', filePath], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const psql = spawn('psql', ['-d', databaseUrl], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    gunzip.stdout.pipe(psql.stdin);
    psql.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql exited with code ${code}`));
    });
    gunzip.on('error', reject);
    psql.on('error', reject);
  });
  logger.info({ type: 'restore_success', filePath, durationMs: Date.now() - start });
}

if (require.main === module) {
  const file = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!file || !url) {
    // eslint-disable-next-line no-console
    console.error('Usage: tsx scripts/restore-db.ts <backup-file.gz> (requires DATABASE_URL)');
    process.exit(1);
  }
  runRestore(file, url)
    .then(() => {
      logger.info({ type: 'restore_completed_cli' });
      process.exit(0);
    })
    .catch((e) => {
      logger.error({
        type: 'restore_failed',
        message: e instanceof Error ? e.message : String(e),
      });
      process.exit(1);
    });
}
