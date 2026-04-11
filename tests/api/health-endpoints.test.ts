import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as redisMod from '@/infrastructure/redis';
import { makeRequestLike } from '../helpers/auth';

describe('Monitoring endpoints resilience', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/health returns version and environment and stays 200 on DB error', async () => {
    vi.mock('@/lib/db', () => {
      return {
        prisma: {
          $queryRaw: vi.fn().mockRejectedValue(new Error('db down')),
        },
      } as any;
    });
    const mod = await import('@/app/api/health/route');
    const req = makeRequestLike({ url: 'http://localhost/api/health', method: 'GET' });
    const res: Response = await (mod as any).GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBeDefined();
    expect(['ok','degraded','error']).toContain(json.data.status);
    expect(json.data.services).toBeDefined();
    expect(json.data.services.database).toBeDefined();
    expect(json.data.services.env).toBeDefined();
    expect(json.data.services.app).toBeDefined();
    expect(json.data.timestamp).toBeDefined();
  });

  it('GET /api/health/deep handles redis/db failure and returns structured services', async () => {
    vi.mock('@/lib/db', () => {
      return {
        prisma: {
          $queryRaw: vi.fn().mockRejectedValue(new Error('db down')),
          outboxEvent: { count: vi.fn().mockResolvedValue(0) },
        },
      } as any;
    });
    vi.spyOn(redisMod, 'redisPing').mockResolvedValueOnce(false);
    vi.spyOn(redisMod, 'getWorkerHeartbeat').mockResolvedValueOnce(null as any);
    const mod = await import('@/app/api/health/deep/route');
    const req = makeRequestLike({
      url: 'http://localhost/api/health/deep',
      method: 'GET',
      role: 'ADMIN',
    });
    const res: Response = await (mod as any).GET(req);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.services).toBeDefined();
    expect(json.data.servicesDetailed).toBeDefined();
    // Even with failures, endpoint responds with a valid status
    expect(['ok','degraded','error']).toContain(json.data.status);
  });

  it('GET /api/metrics returns Prometheus text format with outbox metrics', async () => {
    vi.mock('@/lib/db/client', () => {
      return {
        prisma: {
          $queryRaw: vi.fn().mockResolvedValue([{ count: 1 }]),
          $transaction: vi.fn((fn: (tx: any) => Promise<unknown>) => fn({ $queryRaw: vi.fn().mockResolvedValue([{ count: 1 }]) })),
        },
      } as any;
    });
    vi.mock('@/lib/outbox', () => ({
      getOutboxProcessor: vi.fn(() => ({
        getPendingCount: vi.fn().mockResolvedValue(0),
        getFailedCount: vi.fn().mockResolvedValue(0),
      })),
    }));
    const mod = await import('@/app/api/metrics/route');
    const res: Response = await (mod as any).GET();
    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('outbox_queue_length');
    expect(text).toContain('outbox_failed_count');
    expect(text).toContain('db_connections_active');
  });
});
