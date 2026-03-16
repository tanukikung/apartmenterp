import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureDir } from '../../scripts/backup-db';

describe('GET /api/system/backup-status', () => {
  it('returns latest backup info and config defaults', async () => {
    const dir = path.join(os.tmpdir(), `erp-backup-status-${Math.random().toString(16).slice(2)}`);
    process.env.BACKUP_DIR = dir;
    process.env.BACKUP_RETENTION_DAYS = '7';
    process.env.BACKUP_CRON = '0 3 * * *';
    await ensureDir(dir);
    const f1 = path.join(dir, 'pg_backup_20260313_010000Z.sql.gz');
    const f2 = path.join(dir, 'pg_backup_20260314_020000Z.sql.gz');
    await fs.writeFile(f1, 'a');
    await fs.writeFile(f2, 'b');
    const mod = await import('@/app/api/system/backup-status/route');
    const res: Response = await (mod as any).GET();
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.dir).toBe(dir);
    expect(json.data.retentionDays).toBe(7);
    expect(json.data.cron).toBe('0 3 * * *');
    expect(typeof json.data.latestBackupAt === 'string' || json.data.latestBackupAt === null).toBe(true);
  });
});
