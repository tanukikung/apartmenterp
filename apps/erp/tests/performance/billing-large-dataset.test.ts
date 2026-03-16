import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import { prisma } from '@/lib/db/client';

describe('Billing large dataset import', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('imports 1000 rooms under 3s without duplicates', async () => {
    const svc = createBillingService();
    const rooms = Array.from({ length: 1000 }, (_, i) => `R${i + 1}`);
    const rows = rooms.flatMap((roomNumber) => [
      { roomNumber, year: 2026, month: 3, typeCode: 'RENT', quantity: 1, unitPrice: 1000, description: '' },
      { roomNumber, year: 2026, month: 3, typeCode: 'OTHER', quantity: 1, unitPrice: 50, description: 'x' },
    ]) as any[];

    const createdIds = new Set<string>();
    const p: any = prisma as any;
    p.billingItemType = p.billingItemType || { findMany: vi.fn() };
    p.config = p.config || { findMany: vi.fn() };
    p.room = p.room || { findFirst: vi.fn() };
    p.billingRecord = p.billingRecord || { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
    p.billingItem = p.billingItem || { create: vi.fn() };
    p.outboxEvent = p.outboxEvent || { create: vi.fn() };
    (p.config.findMany as any).mockResolvedValue([]);
    vi.spyOn(p.billingItemType, 'findMany').mockResolvedValue([
      { id: 'type-rent', code: 'RENT', name: 'Rent', description: 'Rent', isRecurring: true },
      { id: 'type-other', code: 'OTHER', name: 'Other', description: 'Other', isRecurring: false },
    ] as any);
    vi.spyOn(p.room, 'findFirst').mockImplementation(async ({ where }: any) => ({ id: `room-${where.roomNumber}`, roomNumber: where.roomNumber } as any));
    vi.spyOn(p.billingRecord, 'findUnique').mockResolvedValue(null as any);
    const tx: any = {
      billingRecord: {
        create: vi.fn(async ({ data }: any) => ({
          id: `br-${data.roomId}-${data.year}-${data.month}`,
          roomId: data.roomId,
          year: data.year,
          month: data.month,
          room: { roomNumber: data.roomId.replace('room-', '') },
        })),
        update: vi.fn(async () => ({})),
      },
      billingItem: {
        create: vi.fn(async () => ({})),
      },
      outboxEvent: {
        create: vi.fn(async ({ data }: any) => {
          createdIds.add(data.aggregateId);
          return { id: 'e' };
        }),
      },
    };
    vi.spyOn(p, '$transaction').mockImplementation(async (fn: any) => fn(tx));

    const start = Date.now();
    const result = await svc.importBillingRows(rows);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(3000);
    expect(result.created.length).toBe(1000);
    expect(createdIds.size).toBe(1000);
  });
});
