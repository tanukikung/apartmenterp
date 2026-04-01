import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/lib/utils/logger';
import { resolveBackupDir } from '../src/lib/runtime-paths';

export function backupDir(): string {
  return resolveBackupDir();
}

export function buildPgDumpArgs(databaseUrl: string): string[] {
  return ['-d', databaseUrl, '-F', 'p'];
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function cleanOldBackups(dir: string, retentionDays: number, s3Bucket?: string): Promise<number> {
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

function commandExists(command: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [command], {
    stdio: 'ignore',
    windowsHide: true,
  });
  return result.status === 0;
}

export function getBackupPrerequisiteFailure(): { message: string; missing: string[] } | null {
  if (!process.env.DATABASE_URL) {
    return {
      message: 'Backup cannot run because DATABASE_URL is not configured.',
      missing: ['DATABASE_URL'],
    };
  }

  const requiredCommands = ['pg_dump', process.platform === 'win32' ? 'gzip.exe' : 'gzip'];
  const missing = requiredCommands.filter((command) => !commandExists(command));

  if (missing.length === 0) {
    return null;
  }

  return {
    message: `Backup cannot run because required tools are missing from PATH: ${missing.join(', ')}. Install the PostgreSQL client tools and gzip, then retry.`,
    missing,
  };
}

async function uploadToS3(filePath: string): Promise<string> {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const { Upload } = await import('@aws-sdk/lib-storage');
  const bucket = process.env.BACKUP_S3_BUCKET!;
  const key = `backups/${path.basename(filePath)}`;
  const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  const upload = new Upload({
    client,
    params: { Bucket: bucket, Key: key, Body: await fs.readFile(filePath) },
  });
  await upload.done();
  const s3Uri = `s3://${bucket}/${key}`;
  logger.info({ type: 'backup_s3_uploaded', s3Uri });
  return s3Uri;
}

async function deleteOldS3Backups(bucket: string, retentionDays: number): Promise<void> {
  try {
    const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: process.env.AWS_REGION || 'ap-southeast-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    const now = Date.now();
    let continuationToken: string | undefined;
    do {
      const listRes = await client.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'backups/',
        ContinuationToken: continuationToken,
      }));
      for (const obj of listRes.Contents || []) {
        if (!obj.Key || !obj.LastModified) continue;
        const ageDays = (now - obj.LastModified.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > retentionDays) {
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
          logger.info({ type: 'backup_s3_deleted_old', key: obj.Key });
        }
      }
      continuationToken = listRes.NextContinuationToken;
    } while (continuationToken);
  } catch (e) {
    logger.warn({ type: 'backup_s3_cleanup_error', message: e instanceof Error ? e.message : String(e) });
  }
}

export async function runBackup(): Promise<{ s3Uri?: string }> {
  const prerequisiteFailure = getBackupPrerequisiteFailure();
  if (prerequisiteFailure) {
    throw new Error(prerequisiteFailure.message);
  }
  const url = process.env.DATABASE_URL as string;
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

  let s3Uri: string | undefined;
  if (process.env.BACKUP_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    try {
      s3Uri = await uploadToS3(filePath);
      await deleteOldS3Backups(process.env.BACKUP_S3_BUCKET, retention);
    } catch (e) {
      logger.warn({ type: 'backup_s3_failed', message: e instanceof Error ? e.message : String(e) });
    }
  }

  logger.info({
    type: 'backup_success',
    filePath,
    s3Uri,
    durationMs: Date.now() - start,
    retentionDays: retention,
    deletedOldFiles: deleted,
  });

  return { s3Uri };
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
