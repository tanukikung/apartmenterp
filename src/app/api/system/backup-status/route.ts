import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { backupDir } from '@/lib/ops/backup';
import { logger } from '@/lib/utils/logger';

async function getLatestBackup(dir: string): Promise<{ file: string; mtime: Date } | null> {
  let entries: { name: string; isFile(): boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), dir }, 'backup-status: cannot read backup directory');
    return null;
  }
  let latest: { file: string; mtime: Date } | null = null;
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.endsWith('.sql.gz')) continue;
    const full = path.join(dir, e.name);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (!stat) continue;
    const mtime = stat.mtime;
    if (!latest || mtime > latest.mtime) {
      latest = { file: full, mtime };
    }
  }
  return latest;
}

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER']);

  const dir = backupDir();
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
