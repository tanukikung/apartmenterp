import { describe, expect, it, vi, beforeEach } from 'vitest';
import { makeRequestLike } from '../helpers/auth';

describe('POST /api/system/backup/run', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('requires authorization and triggers backup', async () => {
    vi.doMock('@/lib/ops/backup', () => {
      return {
        getBackupPrerequisiteFailure: vi.fn().mockReturnValue(null),
        runBackup: vi.fn().mockResolvedValue(undefined),
      };
    });
    const mod = await import('@/app/api/system/backup/run/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/system/backup/run',
      method: 'POST',
      role: 'ADMIN',
    });
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.triggered).toBe(true);
  });

  it('returns actionable preflight errors instead of a generic 500', async () => {
    vi.doMock('@/lib/ops/backup', () => {
      return {
        getBackupPrerequisiteFailure: vi.fn().mockReturnValue({
          message: 'Backup cannot run because required tools are missing from PATH: pg_dump, gzip.exe.',
          missing: ['pg_dump', 'gzip.exe'],
        }),
        runBackup: vi.fn(),
      };
    });
    const mod = await import('@/app/api/system/backup/run/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/system/backup/run',
      method: 'POST',
      role: 'ADMIN',
    });
    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error.message).toContain('required tools are missing from PATH');
    expect(json.error.details.missing).toEqual(['pg_dump', 'gzip.exe']);
  });

  it('rejects when unauthorized', async () => {
    vi.doMock('@/lib/ops/backup', () => {
      return {
        getBackupPrerequisiteFailure: vi.fn().mockReturnValue(null),
        runBackup: vi.fn().mockResolvedValue(undefined),
      };
    });
    const mod = await import('@/app/api/system/backup/run/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/system/backup/run',
      method: 'POST',
    });
    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(401);
  });
});
