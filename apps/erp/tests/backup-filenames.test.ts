import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { generateBackupFilePath, cleanOldBackups, ensureDir } from '../scripts/backup-db';
import fs from 'node:fs/promises';

describe('Backup scripts helpers', () => {
  it('generates timestamped .sql.gz filename', () => {
    const dir = path.join(os.tmpdir(), 'erp-backup-test');
    const when = new Date(Date.UTC(2026, 2, 14, 3, 4, 5));
    const file = generateBackupFilePath(dir, when);
    expect(file.startsWith(dir)).toBe(true);
    expect(file.endsWith('.sql.gz')).toBe(true);
    expect(path.basename(file)).toMatch(/pg_backup_20260314_030405Z\.sql\.gz$/);
  });

  it('retention cleanup removes files older than retention days', async () => {
    const dir = path.join(os.tmpdir(), `erp-backup-ret-${Math.random().toString(16).slice(2)}`);
    await ensureDir(dir);
    const makeFile = async (name: string, daysAgo: number) => {
      const full = path.join(dir, name);
      await fs.writeFile(full, 'x');
      const past = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      await fs.utimes(full, past, past);
    };
    await makeFile('keep.sql.gz', 1);
    await makeFile('old1.sql.gz', 8);
    await makeFile('old2.sql.gz', 10);
    const deleted = await cleanOldBackups(dir, 7);
    expect(deleted).toBe(2);
    const remaining = await fs.readdir(dir);
    expect(remaining).toContain('keep.sql.gz');
  });
});

