import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as redisMod from '@/infrastructure/redis';

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
    const res: Response = await (mod as any).GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.version).toBeDefined();
    expect(json.data.environment).toBeDefined();
    expect(['ok','degraded','error']).toContain(json.data.status);
    // Should include latencies object
    expect(json.data.latencies).toBeDefined();
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
    const res: Response = await (mod as any).GET();
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.services).toBeDefined();
    expect(json.data.servicesDetailed).toBeDefined();
    // Even with failures, endpoint responds with a valid status
    expect(['ok','degraded','error']).toContain(json.data.status);
  });

  it('GET /api/metrics includes invoices and payments fields with graceful fallbacks', async () => {
    vi.mock('@/lib/db', () => {
      return {
        prisma: {
          $queryRaw: vi.fn().mockResolvedValue(1),
          outboxEvent: { count: vi.fn().mockResolvedValue(0) },
          invoice: { count: vi.fn()
            .mockResolvedValueOnce(10) // total
            .mockResolvedValueOnce(6)  // paid
            .mockResolvedValueOnce(2)  // overdue
          },
          payment: { count: vi.fn().mockResolvedValueOnce(4) },
          paymentTransaction: { count: vi.fn()
            .mockResolvedValueOnce(1)  // NEED_REVIEW
            .mockResolvedValueOnce(8)  // total
            .mockResolvedValueOnce(3)  // AUTO_MATCHED
          },
        },
      } as any;
    });
    const mod = await import('@/app/api/metrics/route');
    const res: Response = await (mod as any).GET();
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.invoices).toBeDefined();
    expect(typeof json.data.invoices.total).toBe('number');
    expect(typeof json.data.invoices.paid).toBe('number');
    expect(typeof json.data.invoices.overdue).toBe('number');
    expect(json.data.payments).toBeDefined();
    expect(typeof json.data.payments.manualReviewCount).toBe('number');
    expect(typeof json.data.payments.confirmedCount).toBe('number');
    expect(typeof json.data.payments.matchRate).toBe('number');
  });
});
