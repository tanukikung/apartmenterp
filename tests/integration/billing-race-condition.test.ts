import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import { EventTypes } from '@/lib';

describe('Billing lock race condition protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('only one lock generates invoice event and locks billing record', async () => {
    // In-memory state for a RoomBilling record
    const billingPeriod = {
      id: 'period-1',
      year: 2026,
      month: 3,
      dueDay: 5,
    };
    const record = {
      id: '00000000-0000-0000-0000-00000000b111',
      roomNo: '101',
      billingPeriodId: 'period-1',
      status: 'DRAFT',
      totalDue: 1000,
      rentAmount: 1000,
      billingPeriod,
      lockedAt: null as Date | null,
      lockedBy: null as string | null,
    };

    // Track whether the first lock has been acquired (for updateMany mock)
    let firstLockDone = false;

    // Build a mock tx that mirrors what the $transaction callback receives
    const mockTx = {
      roomBilling: {
        findUnique: vi.fn(async ({ where, include }: any) => {
          if (where?.id !== record.id) return null;
          if (include?.billingPeriod) return { ...record, billingPeriod };
          return { ...record };
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          if (where?.id !== record.id) throw new Error('not found');
          if (firstLockDone) return { count: 0 };
          firstLockDone = true;
          record.status = data.status ?? record.status;
          record.lockedAt = data.lockedAt ?? record.lockedAt;
          record.lockedBy = data.lockedBy ?? record.lockedBy;
          return { count: 1 };
        }),
        update: vi.fn(async ({ data }: any) => {
          record.status = data.status ?? record.status;
          return { ...record, billingPeriod };
        }),
      },
      billingPeriod: {
        findUnique: vi.fn(async () => billingPeriod),
        findFirst: vi.fn(async () => billingPeriod),
      },
      outboxEvent: {
        createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
      },
      billingAuditLog: {
        create: vi.fn(async ({ data }: any) => ({ id: data.id ?? 'audit-new' })),
      },
    };

    // Mock $transaction to run the callback synchronously with our mockTx
    const $transactionMock = vi.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx as any));

    // Spy on prisma and replace $transaction
    const { prisma } = await import('@/lib/db/client');
    const p = prisma as any;
    const origTransaction = p.$transaction;
    p.$transaction = $transactionMock;

    // Mock billingPeriod.findUnique OUTSIDE the tx (called after tx completes)
    p.billingPeriod = { findUnique: vi.fn(async () => billingPeriod) };

    const createManyMock = mockTx.outboxEvent.createMany;
    const updateManyMock = mockTx.roomBilling.updateMany;

    const svc = createBillingService();
    const lockInput = { force: false } as any;

    const [r1, r2] = await Promise.allSettled([
      svc.lockBillingRecord(record.id, lockInput),
      svc.lockBillingRecord(record.id, lockInput),
    ]);

    p.$transaction = origTransaction;

    const success = [r1, r2].filter((r) => r.status === 'fulfilled');
    expect(success.length).toBe(1);
    expect(record.status).toBe('LOCKED');

    expect(createManyMock).toHaveBeenCalledTimes(1);
    expect(createManyMock.mock.calls[0]?.[0]?.data).toHaveLength(2);
    const eventTypes = createManyMock.mock.calls[0]?.[0]?.data.map((e: any) => e.eventType);
    expect(eventTypes).toEqual([
      EventTypes.BILLING_LOCKED,
      EventTypes.INVOICE_GENERATION_REQUESTED,
    ]);
    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });
});
