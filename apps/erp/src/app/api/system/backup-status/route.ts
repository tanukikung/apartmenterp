import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

async function getLatestBackup(dir: string): Promise<{ file: string; mtime: Date } | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let latest: { file: string; mtime: Date } | null = null;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.sql.gz')) continue;
    const full = path.join(dir, e.name);
    const stat = await fs.stat(full).catch(() => null);
    if (!stat) continue;
    const mtime = stat.mtime;
    if (!latest || mtime > latest.mtime) {
      latest = { file: full, mtime };
    }
  }
  return latest;
}

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const dir = process.env.BACKUP_DIR || path.join(os.tmpdir(), 'apartment-erp-backups');
  const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '7', 10);
  const cron = process.env.BACKUP_CRON || '0 3 * * *';
  const latest = await getLatestBackup(dir);
  const data = {
    dir,
    retentionDays,
    cron,
    latestBackupAt: latest?.mtime?.toISOString() ?? null,
    latestBackupFile: latest?.file ?? null,
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json({ success: true, data } as ApiResponse<typeof data>);
});

