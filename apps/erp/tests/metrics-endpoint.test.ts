import { describe, it, expect } from 'vitest';

describe('/api/metrics', () => {
  it('returns metrics including outbox fields', async () => {
    const mod = await import('@/app/api/metrics/route');
    const res: Response = await (mod as any).GET();
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.dbStatus).toBeDefined();
    expect(json.data.uptime).toBeDefined();
    expect(json.data.outbox).toBeDefined();
    expect(typeof json.data.outbox.queueLength).toBe('number');
    expect(typeof json.data.outbox.failedCount).toBe('number');
  });
});

