import { describe, it, expect, vi } from 'vitest';

// Mock the outbox module to provide proper return values
vi.mock('@/lib/outbox', () => ({
  getOutboxProcessor: vi.fn(() => ({
    getPendingCount: vi.fn().mockResolvedValue(0),
    getFailedCount: vi.fn().mockResolvedValue(0),
  })),
}));

// Mock $queryRaw to return valid db metrics
vi.mock('@/lib/db/client', () => {
  const mockPrisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ count: 1 }]),
    $transaction: vi.fn((fn: (tx: any) => Promise<unknown>) => fn(mockPrisma)),
    outboxEvent: { count: vi.fn().mockResolvedValue(0) },
  };
  return { prisma: mockPrisma };
});

describe('/api/metrics', () => {
  it('returns metrics including outbox fields', async () => {
    const mod = await import('@/app/api/metrics/route');
    const res: Response = await (mod as any).GET();
    expect(res.ok).toBe(true);
    const text = await res.text();
    // Should return Prometheus text format
    expect(text).toContain('outbox_queue_length');
    expect(text).toContain('outbox_failed_count');
  });
});

