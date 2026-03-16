import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import { prisma } from '@/lib/db/client';
import { getEventBus, EventTypes } from '@/lib';

describe('Billing lock race condition protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const bus = getEventBus();
    bus.clearHistory();
  });

  it('only one lock generates invoice event and locks billing record', async () => {
    // In-memory state for a billing record with items
    const record = {
      id: '00000000-0000-0000-0000-00000000b111',
      roomId: '00000000-0000-0000-0000-00000000r001',
      year: 2026,
      month: 3,
      status: 'OPEN',
      subtotal: 1000,
      room: { roomNumber: '101' },
      items: [{ id: 'i1', amount: 1000, itemType: { code: 'RENT' } }],
      lockedAt: null as Date | null,
      lockedBy: null as string | null,
    };

    const p: any = prisma as any;
    p.billingRecord = p.billingRecord || {};
    p.billingRecord.findUnique = vi.fn(async ({ where }: any) => {
      if (where?.id === record.id) {
        return { ...record };
      }
      return null;
    });
    const updateMock = vi.fn(async ({ where, data, include }: any) => {
      if (where?.id !== record.id) throw new Error('not found');
      if (record.status === 'LOCKED') {
        // Simulate DB-level unique/constraint preventing second lock
        throw new Error('already locked');
      }
      record.status = data.status || record.status;
      record.lockedAt = data.lockedAt || record.lockedAt;
      record.lockedBy = data.lockedBy || record.lockedBy;
      return { ...record, room: record.room, items: record.items };
    });
    p.billingRecord.update = updateMock;
    p.billingItemType = { findMany: vi.fn(async () => [{ id: 'type-rent', code: 'RENT', description: 'Rent' }]) };

    const bus = getEventBus();
    const publishSpy = vi.spyOn(bus as any, 'publish').mockResolvedValue({} as any);

    const svc = createBillingService();
    const lockInput = { lockedBy: 'admin' } as any;

    const [r1, r2] = await Promise.allSettled([
      svc.lockBillingRecord(record.id, lockInput),
      svc.lockBillingRecord(record.id, lockInput),
    ]);

    const success = [r1, r2].filter(r => r.status === 'fulfilled');
    expect(success.length).toBe(1);
    expect(record.status).toBe('LOCKED');

    const lockedCalls = publishSpy.mock.calls.filter(c => c[0] === EventTypes.BILLING_LOCKED).length;
    const reqCalls = publishSpy.mock.calls.filter(c => c[0] === EventTypes.INVOICE_GENERATION_REQUESTED).length;
    expect(lockedCalls).toBe(1);
    expect(reqCalls).toBe(1);
    expect(updateMock).toHaveBeenCalledTimes(2);
  });
});
