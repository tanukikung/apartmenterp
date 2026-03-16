import { describe, it, expect, vi } from 'vitest';

describe('POST /api/system/backup/run', () => {
  it('requires authorization and triggers backup', async () => {
    vi.mock('@/lib/ops/backup', () => {
      return { runBackup: vi.fn().mockResolvedValue(undefined) };
    });
    const mod = await import('@/app/api/system/backup/run/route');
    // Simulate admin cookie
    const req: any = {
      cookies: {
        get: (name: string) => (name === 'role' ? { value: 'ADMIN' } : undefined),
      },
      headers: new Map(),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.triggered).toBe(true);
  });

  it('rejects when unauthorized', async () => {
    const mod = await import('@/app/api/system/backup/run/route');
    const req: any = {
      cookies: { get: () => undefined },
      headers: new Map(),
    };
    const res: Response = await (mod as any).POST(req);
    expect(res.status).toBe(403);
  });
});
