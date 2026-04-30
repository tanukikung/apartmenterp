import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import type { WorkbookParseResult } from '@/modules/billing/import-parser';
import { prisma } from '@/lib/db/client';

describe('Billing large dataset import', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // FIX H11: Mocks updated to provide findMany (the current implementation uses
  // findMany for batch prefetch, not findUnique per row). Tests import performance
  // by mocking $transaction to run in-process.
  it('imports 1000 rooms under 3s without duplicates', async () => {
    const svc = createBillingService();
    const rooms = Array.from({ length: 1000 }, (_, i) => `R${i + 1}`);

    const createdIds = new Set<string>();
    const p: any = prisma as any;
    p.room = p.room || {};
    p.billingPeriod = p.billingPeriod || {};
    p.roomBilling = p.roomBilling || {};
    p.outboxEvent = p.outboxEvent || {};

    vi.spyOn(p.room, 'findMany').mockResolvedValue(
      rooms.map((roomNo) => ({
        roomNo,
        defaultAccountId: 'acc-1',
        defaultRuleCode: 'RULE-1',
        defaultRentAmount: 1000,
      }))
    );

    const periodId = 'period-2026-3';
    vi.spyOn(p.billingPeriod, 'findUnique').mockResolvedValue({
      id: periodId,
      year: 2026,
      month: 3,
      dueDay: 25,
    });
    vi.spyOn(p.roomBilling, 'findMany').mockResolvedValue([]);
    vi.spyOn(p.roomBilling, 'findUnique').mockResolvedValue(null);

    const createdRecords: any[] = [];
    const tx: any = {
      roomBilling: {
        create: vi.fn(async ({ data }: any) => {
          const record = {
            id: `rb-${data.roomNo}`,
            roomNo: data.roomNo,
            billingPeriodId: data.billingPeriodId,
            recvAccountId: data.recvAccountId,
            ruleCode: data.ruleCode,
            rentAmount: data.rentAmount,
            totalDue: data.totalDue,
            status: 'DRAFT',
          };
          createdRecords.push(record);
          return record;
        }),
      },
      outboxEvent: {
        create: vi.fn(async ({ data }: any) => {
          createdIds.add(data.aggregateId);
          return { id: 'e' };
        }),
      },
    };
    vi.spyOn(p, '$transaction').mockImplementation(async (fn: any) => fn(tx));

    // Build WorkbookParseResult
    const workbook: WorkbookParseResult = {
      floors: [
        {
          sheetName: 'FLOOR_1',
          errors: [],
          rows: rooms.map((roomNo) => ({
            roomNo,
            floorSheetName: 'FLOOR_1',
            recvAccountOverrideId: null,
            ruleOverrideCode: null,
            rentAmount: 1000,
            waterMode: 'NORMAL' as const,
            waterPrev: null,
            waterCurr: null,
            waterUnitsManual: null,
            waterUnits: 0,
            waterUsageCharge: 0,
            waterServiceFeeManual: null,
            waterServiceFee: 0,
            waterTotal: 0,
            electricMode: 'NORMAL' as const,
            electricPrev: null,
            electricCurr: null,
            electricUnitsManual: null,
            electricUnits: 0,
            electricUsageCharge: 0,
            electricServiceFeeManual: null,
            electricServiceFee: 0,
            electricTotal: 0,
            furnitureFee: 0,
            otherFee: 0,
            totalDue: 1000,
            note: null,
            checkNotes: null,
            roomStatus: 'VACANT' as const,
          })),
        },
      ],
      totalRows: rooms.length,
      totalErrors: 0,
    };

    const start = Date.now();
    const result = await svc.importBillingRows(workbook, 2026, 3);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(3000);
    expect(result.created.length).toBe(1000);
    expect(createdIds.size).toBe(1000);
  });
});
