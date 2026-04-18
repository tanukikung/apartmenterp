import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBillingService } from '@/modules/billing/billing.service';
import type { WorkbookParseResult } from '@/modules/billing/import-parser';
import { prisma } from '@/lib/db/client';

describe('Billing performance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates billing for 500 rooms under 2s', async () => {
    const rooms = Array.from({ length: 500 }, (_, i) => `R${(i + 101).toString()}`);

    const p: any = prisma as any;
    if (!p.room) p.room = { findUnique: vi.fn() };
    if (!p.billingPeriod) p.billingPeriod = { findUnique: vi.fn(), create: vi.fn() };
    if (!p.roomBilling) p.roomBilling = { findUnique: vi.fn(), create: vi.fn() };
    if (!p.outboxEvent) p.outboxEvent = { create: vi.fn() };

    vi.spyOn(p.room, 'findUnique').mockImplementation(async ({ where }: any) => {
      const rn = where?.roomNo;
      if (!rn) return null;
      return { roomNo: rn, defaultAccountId: 'acc-1', defaultRuleCode: 'RULE-1', defaultRentAmount: 1000 };
    });

    const periodId = 'period-2026-3';
    vi.spyOn(p.billingPeriod, 'findUnique').mockResolvedValue({ id: periodId, year: 2026, month: 3, dueDay: 25 });
    vi.spyOn(p.roomBilling, 'findUnique').mockResolvedValue(null);

    const tx: any = {
      roomBilling: {
        create: vi.fn(async ({ data }: any) => ({
          id: `bill-${data.roomNo}`, roomNo: data.roomNo,
          billingPeriodId: data.billingPeriodId, totalDue: data.totalDue, status: 'DRAFT',
        })),
      },
      outboxEvent: { create: vi.fn(async () => ({ id: 'e' })) },
    };
    vi.spyOn(p, '$transaction').mockImplementation(async (fn: any) => fn(tx));

    // Build WorkbookParseResult with one FLOOR_1 sheet
    const workbook: WorkbookParseResult = {
      floors: [{
        sheetName: 'FLOOR_1',
        errors: [],
        rows: rooms.map((roomNo) => ({
          roomNo, floorSheetName: 'FLOOR_1',
          recvAccountOverrideId: null, ruleOverrideCode: null,
          rentAmount: 1000,
          waterMode: 'NORMAL' as const, waterPrev: null, waterCurr: null, waterUnitsManual: null,
          waterUnits: 0, waterUsageCharge: 0, waterServiceFeeManual: null, waterServiceFee: 0, waterTotal: 0,
          electricMode: 'NORMAL' as const, electricPrev: null, electricCurr: null, electricUnitsManual: null,
          electricUnits: 0, electricUsageCharge: 0, electricServiceFeeManual: null, electricServiceFee: 0, electricTotal: 0,
          furnitureFee: 0, otherFee: 0, totalDue: 1000,
          note: null, checkNotes: null, roomStatus: 'VACANT' as const,
        })),
      }],
      totalRows: rooms.length,
      totalErrors: 0,
    };

    const service = createBillingService();
    const start = Date.now();
    const result = await service.importBillingRows(workbook, 2026, 3);
    const elapsed = Date.now() - start;

    expect(result.created.length).toBe(500);
    expect(elapsed).toBeLessThan(2000);
  });
});
