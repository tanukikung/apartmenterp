import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRequestLike } from '../helpers/auth';
import { getServiceContainer } from '@/lib/service-container';

describe('API auth boundary hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('denies anonymous and forged role cookies, denies insufficient role, and allows signed admins', async () => {
    const route = await import('@/app/api/billing/[id]/lock/route');

    vi.spyOn(getServiceContainer().billingService, 'lockBillingRecord').mockImplementation(async () => ({
      id: 'bill-1',
      roomId: 'room-1',
      roomNo: '101',
      billingPeriodId: 'bp-1',
      year: 2026,
      month: 3,
      status: 'LOCKED' as const,
      subtotal: 1000,
      totalAmount: 1000,
      lockedAt: new Date('2026-03-17T00:00:00Z'),
      lockedBy: 'verified-admin',
      createdAt: new Date('2026-03-17T00:00:00Z'),
      updatedAt: new Date('2026-03-17T00:00:00Z'),
    } as any));

    const body = { force: false };

    const anonymous = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/billing/bill-1/lock',
        method: 'POST',
        body,
      }) as any,
      { params: { id: 'bill-1' } } as any,
    );
    expect(anonymous.status).toBe(401);

    const forgedRole = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/billing/bill-1/lock',
        method: 'POST',
        plainRole: 'ADMIN',
        body,
      }) as any,
      { params: { id: 'bill-1' } } as any,
    );
    expect(forgedRole.status).toBe(401);

    const tenant = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/billing/bill-1/lock',
        method: 'POST',
        role: 'TENANT' as any,
        body,
      }) as any,
      { params: { id: 'bill-1' } } as any,
    );
    expect(tenant.status).toBe(403);

    const admin = await route.POST(
      makeRequestLike({
        url: 'http://localhost/api/billing/bill-1/lock',
        method: 'POST',
        role: 'ADMIN',
        sessionOverrides: { sub: 'verified-admin' },
        body,
      }) as any,
      { params: { id: 'bill-1' } } as any,
    );
    expect(admin.status).toBe(200);
    expect((await admin.json()).success).toBe(true);
  });
});
