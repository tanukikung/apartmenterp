import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import { prisma } from '@/lib/db/client';

describe('Billing performance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates billing for 500 rooms under 2s', async () => {
    const rooms = Array.from({ length: 500 }, (_, i) => `R${(i + 101).toString()}`);

    const p: any = prisma as any;
    if (!p.billingItemType) p.billingItemType = { findMany: vi.fn() };
    if (!p.config) p.config = { findMany: vi.fn() };
    if (!p.room) p.room = { findFirst: vi.fn() };
    if (!p.billingRecord) p.billingRecord = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
    if (!p.billingItem) p.billingItem = { create: vi.fn(), aggregate: vi.fn() };
    if (!p.outboxEvent) p.outboxEvent = { create: vi.fn() };

    (p.billingItemType.findMany as any).mockResolvedValue([
      { id: 'type-rent', code: 'RENT', description: 'Rent', isRecurring: true },
    ]);

    (p.config.findMany as any).mockResolvedValue([
      { id: '1', key: 'billing.billingDay', value: '1' },
      { id: '2', key: 'billing.dueDay', value: '5' },
      { id: '3', key: 'billing.overdueDay', value: '15' },
    ]);

    (p.room.findFirst as any).mockImplementation(async ({ where }: any) => {
      const rn = where?.roomNumber;
      if (!rn) return null;
      return { id: `room-${rn}`, roomNumber: rn };
    });

    (p.billingRecord.findUnique as any).mockResolvedValue(null);

    (p.billingRecord.create as any).mockImplementation(async ({ data }: any) => {
      return { id: `bill-${data.roomId}-${data.year}-${data.month}`, roomId: data.roomId, year: data.year, month: data.month, room: { roomNumber: 'X' } };
    });
    (p.billingItem.create as any).mockResolvedValue({});
    (p.billingRecord.update as any).mockResolvedValue({});
    (p.outboxEvent.create as any).mockResolvedValue({});

    const rows = rooms.map((roomNumber) => ({
      roomNumber,
      year: 2026,
      month: 3,
      typeCode: 'RENT' as const,
      description: 'Monthly Rent',
      quantity: 1,
      unitPrice: 1000,
    }));

    const service = createBillingService();
    const start = Date.now();
    const result = await service.importBillingRows(rows);
    const elapsed = Date.now() - start;

    expect(result.created.length).toBe(500);
    expect(elapsed).toBeLessThan(2000);
  });
});
