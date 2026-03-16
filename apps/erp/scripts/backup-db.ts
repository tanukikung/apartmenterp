import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { logger } from '@/lib/utils/logger';

export function backupDir(): string {
  return process.env.BACKUP_DIR || path.join(os.tmpdir(), 'apartment-erp-backups');
}

export function buildPgDumpArgs(databaseUrl: string): string[] {
  return ['-d', databaseUrl, '-F', 'p'];
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function cleanOldBackups(dir: string, retentionDays: number): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  let deleted = 0;
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = path.join(dir, e.name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    const ageDays = (now - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays > retentionDays) {
      await fs.rm(full).catch(() => undefined);
      deleted++;
    }
  }
  return deleted;
}

export function generateBackupFilePath(dir: string, now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const ts = `${y}${m}${d}_${hh}${mm}${ss}Z`;
  return path.join(dir, `pg_backup_${ts}.sql.gz`);
}

export async function runBackup(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL not set');
  }
  const dir = backupDir();
  await ensureDir(dir);
  const start = Date.now();
  const filePath = generateBackupFilePath(dir, new Date());
  logger.info({ type: 'backup_start', filePath, dir });
  const args = buildPgDumpArgs(url);

  await new Promise<void>((resolve, reject) => {
    const pgDump = spawn('pg_dump', args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const gzip = spawn(process.platform === 'win32' ? 'gzip.exe' : 'gzip', ['-c'], { stdio: ['pipe', 'pipe', 'inherit'] });

    pgDump.stdout.pipe(gzip.stdin);

    const out = fs.open(filePath, 'w').then((fh) => fh.createWriteStream());
    out.then((stream) => {
      gzip.stdout.pipe(stream);
    });

    gzip.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gzip exited with code ${code}`));
    });

    pgDump.on('error', reject);
    gzip.on('error', reject);
  });

  const retention = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);
  const deleted = await cleanOldBackups(dir, retention);
  logger.info({
    type: 'backup_success',
    filePath,
    durationMs: Date.now() - start,
    retentionDays: retention,
    deletedOldFiles: deleted,
  });
}

if (require.main === module) {
  runBackup()
    .then(() => {
      logger.info({ type: 'backup_completed_cli' });
      process.exit(0);
    })
    .catch((e) => {
      logger.error({
        type: 'backup_failed',
        message: e instanceof Error ? e.message : String(e),
      });
      process.exit(1);
    });
}
