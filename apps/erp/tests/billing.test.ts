import { describe, it, expect, vi } from 'vitest';
import { getBillingService } from '@/modules/billing/billing.service';
import { prisma } from '@/lib';

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    prisma: {
      room: { findFirst: vi.fn() },
      billingRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      billingItemType: { findMany: vi.fn() },
      billingItem: { create: vi.fn() },
      outboxEvent: { create: vi.fn() },
      config: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: any) =>
        fn({
          billingRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
          billingItemType: { findMany: vi.fn() },
          billingItem: { create: vi.fn() },
          outboxEvent: { create: vi.fn() },
        })
      ),
    },
  };
});

describe('BillingService', () => {
  it('rejects duplicate billing record for same room/month', async () => {
    const billingService = getBillingService();
    vi.spyOn(prisma.room, 'findFirst').mockResolvedValue({ id: 'room-1', roomNumber: '101' } as any);
    vi.spyOn(prisma.billingRecord, 'findUnique').mockResolvedValue({ id: 'existing' } as any);
    vi.spyOn(prisma.billingItemType, 'findMany').mockResolvedValue([
      { id: 'type-rent', code: 'RENT', isRecurring: true, description: 'Rent' },
    ] as any);
    vi.spyOn(prisma.config, 'findMany').mockResolvedValue([
      { key: 'billing.billingDay', value: '1' },
      { key: 'billing.dueDay', value: '5' },
      { key: 'billing.overdueDay', value: '15' },
    ] as any);

    await expect(
      billingService.importBillingRows([
        { roomNumber: '101', year: 2026, month: 3, typeCode: 'RENT', quantity: 1, unitPrice: 5000 },
      ])
    ).rejects.toThrow(/already exists/);
  });

  it('creates billing record and items atomically', async () => {
    const billingService = getBillingService();
    vi.spyOn(prisma.room, 'findFirst').mockResolvedValue({ id: 'room-1', roomNumber: '101' } as any);
    vi.spyOn(prisma.billingRecord, 'findUnique').mockResolvedValue(null as any);
    vi.spyOn(prisma.billingItemType, 'findMany').mockResolvedValue([
      { id: 'type-rent', code: 'RENT', isRecurring: true, description: 'Rent' },
    ] as any);
    vi.spyOn(prisma.config, 'findMany').mockResolvedValue([
      { key: 'billing.billingDay', value: '1' },
      { key: 'billing.dueDay', value: '5' },
      { key: 'billing.overdueDay', value: '15' },
    ] as any);

    const txMock = {
      billingRecord: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'br-1', roomId: 'room-1', year: 2026, month: 3 }), update: vi.fn() },
      billingItemType: { findMany: vi.fn().mockResolvedValue([{ id: 'type-rent', code: 'RENT', isRecurring: true }]) },
      billingItem: { create: vi.fn().mockResolvedValue({}) },
      outboxEvent: { create: vi.fn() },
    };
    vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (fn: unknown) => {
      if (typeof fn !== 'function') {
        throw new Error('Expected transaction callback');
      }
      return (await (fn as (tx: typeof txMock) => unknown)(txMock as never)) as never;
    });

    const result = await billingService.importBillingRows([
      { roomNumber: '101', year: 2026, month: 3, typeCode: 'RENT', quantity: 1, unitPrice: 5000 },
    ]);

    expect(txMock.billingRecord.create).toHaveBeenCalledTimes(1);
    expect(txMock.billingItem.create).toHaveBeenCalledTimes(1);
    expect(txMock.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(result.created).toHaveLength(1);
  });
});
