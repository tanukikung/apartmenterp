/**
 * Unit tests for billing-calculator.ts
 * Tests all MeterMode and ServiceFeeMode combinations
 */

import { describe, test, expect } from 'vitest';
import { computeRoomBilling, computeCheckNotes } from '@/modules/billing/billing-calculator';
import type { RoomBillingRow, BillingRuleData } from '@/modules/billing/billing-calculator';

// Helper to build a default rule
function makeRule(overrides: Partial<BillingRuleData> = {}): BillingRuleData {
  return {
    waterEnabled: true,
    waterUnitPrice: 10,
    waterMinCharge: 0,
    waterServiceFeeMode: 'NONE',
    waterServiceFeeAmount: 0,
    waterS1Upto: null,
    waterS1Rate: null,
    waterS2Upto: null,
    waterS2Rate: null,
    waterS3Rate: null,
    electricEnabled: true,
    electricUnitPrice: 5,
    electricMinCharge: 0,
    electricServiceFeeMode: 'NONE',
    electricServiceFeeAmount: 0,
    electricS1Upto: null,
    electricS1Rate: null,
    electricS2Upto: null,
    electricS2Rate: null,
    electricS3Rate: null,
    ...overrides,
  };
}

function makeRow(overrides: Partial<RoomBillingRow> = {}): RoomBillingRow {
  return {
    rentAmount: 10000,
    waterMode: 'NORMAL',
    waterPrev: 100,
    waterCurr: 150,
    waterUnitsManual: null,
    waterServiceFeeManual: null,
    electricMode: 'NORMAL',
    electricPrev: 200,
    electricCurr: 250,
    electricUnitsManual: null,
    electricServiceFeeManual: null,
    furnitureFee: 0,
    otherFee: 0,
    ...overrides,
  };
}

describe('billing-calculator', () => {

  // ── NORMAL mode ──────────────────────────────────────────────────────────

  describe('NORMAL mode', () => {
    test('water: units = curr - prev, charge = units × rate', () => {
      const row = makeRow({ waterPrev: 100, waterCurr: 150 }); // units = 50
      const rule = makeRule({ waterUnitPrice: 10 });
      const result = computeRoomBilling(row, rule);
      expect(result.waterUnits).toBe(50);
      expect(result.waterUsageCharge).toBe(500); // 50 × 10
    });

    test('electric: units = curr - prev, charge = units × rate', () => {
      const row = makeRow({ electricPrev: 200, electricCurr: 250 }); // units = 50
      const rule = makeRule({ electricUnitPrice: 5 });
      const result = computeRoomBilling(row, rule);
      expect(result.electricUnits).toBe(50);
      expect(result.electricUsageCharge).toBe(250); // 50 × 5
    });

    test('minCharge enforced when usage charge below minimum', () => {
      const row = makeRow({ waterPrev: 100, waterCurr: 101 }); // only 1 unit
      const rule = makeRule({ waterUnitPrice: 10, waterMinCharge: 100 });
      const result = computeRoomBilling(row, rule);
      // usage charge = 1 × 10 = 10, but minCharge = 100
      expect(result.waterUsageCharge).toBe(100);
      expect(result.waterTotal).toBe(100);
    });

    test('zero usage returns 0 (no negative)', () => {
      const row = makeRow({ waterPrev: 100, waterCurr: 100 }); // 0 units
      const rule = makeRule({ waterUnitPrice: 10 });
      const result = computeRoomBilling(row, rule);
      expect(result.waterUnits).toBe(0);
      expect(result.waterUsageCharge).toBe(0);
    });
  });

  // ── STEP mode ─────────────────────────────────────────────────────────────

  describe('STEP mode', () => {
    test('tiered pricing: Tier 1 only', () => {
      const row = makeRow({ waterMode: 'STEP', waterPrev: 0, waterCurr: 50 }); // 50 units
      const rule = makeRule({
        waterUnitPrice: 10,
        waterS1Upto: 100, waterS1Rate: 8,   // 0-100 units @ 8
        waterS2Upto: null, waterS2Rate: null,
        waterS3Rate: null,
      });
      const result = computeRoomBilling(row, rule);
      // Tier1: 50 × 8 = 400
      expect(result.waterUnits).toBe(50);
      expect(result.waterUsageCharge).toBe(400);
    });

    test('tiered pricing: Tier 1 + Tier 2', () => {
      // Bug case: s2Upto=105 (tier-2 capacity = 5), but usage=150 exceeds it.
      // Old buggy code used s2Upto=105 as tier2Units directly (wrong: 50 units × s2Rate).
      // Fixed code uses tier2Capacity=5 (105-100): only 5 units at tier-2 rate, rest at tier-3.
      const row = makeRow({ waterMode: 'STEP', waterPrev: 0, waterCurr: 150 }); // 150 units
      const rule = makeRule({
        waterUnitPrice: 10,
        waterS1Upto: 100, waterS1Rate: 8,    // 0-100 @ 8 = 800
        waterS2Upto: 105, waterS2Rate: 12,   // tier-2 capacity = 5 units (105-100), remainder goes to tier-3
        waterS3Rate: 20,                     // 100+ @ 20
      });
      const result = computeRoomBilling(row, rule);
      expect(result.waterUnits).toBe(150);
      // Tier1: 100×8=800, Tier2: 5×12=60, Tier3: 45×20=900 → Total = 1760
      expect(result.waterUsageCharge).toBe(1760);
    });

    test('tiered pricing: all three tiers', () => {
      const row = makeRow({ waterMode: 'STEP', waterPrev: 0, waterCurr: 300 }); // 300 units
      const rule = makeRule({
        waterS1Upto: 100, waterS1Rate: 8,   // 0-100 @ 8 = 800
        waterS2Upto: 200, waterS2Rate: 12,  // tier-2 capacity = 100 (200-100)
        waterS3Rate: 20,                    // 200+ @ 20
      });
      const result = computeRoomBilling(row, rule);
      expect(result.waterUnits).toBe(300);
      // Tier1: 100×8=800, Tier2: 100×12=1200, Tier3: 100×20=2000 → Total = 4000
      expect(result.waterUsageCharge).toBe(4000);
    });

    test('tiered pricing: edge case where usage exactly at tier 2 boundary', () => {
      // Usage = 200 = s2Upto, tier-2 capacity = 100 (200-100)
      // All 200 units consumed within tier 1 + tier 2 (no tier 3)
      const row = makeRow({ waterMode: 'STEP', waterPrev: 0, waterCurr: 200 });
      const rule = makeRule({
        waterS1Upto: 100, waterS1Rate: 8,
        waterS2Upto: 200, waterS2Rate: 12,
        waterS3Rate: 20,
      });
      const result = computeRoomBilling(row, rule);
      // Tier1: 100×8=800, Tier2: 100×12=1200, Tier3: 0 → Total = 2000
      expect(result.waterUsageCharge).toBe(2000);
    });

    test('STEP with minCharge enforced', () => {
      const row = makeRow({ waterMode: 'STEP', waterPrev: 0, waterCurr: 5 }); // 5 units
      const rule = makeRule({
        waterS1Upto: 100, waterS1Rate: 2, // 5 × 2 = 10
        waterS2Upto: null, waterS2Rate: null,
        waterS3Rate: null,
        waterMinCharge: 50,
      });
      const result = computeRoomBilling(row, rule);
      expect(result.waterUsageCharge).toBe(50); // minCharge wins
    });
  });

  // ── FLAT mode ─────────────────────────────────────────────────────────────

  describe('FLAT mode', () => {
    test('water flat uses waterFlatAmount directly, ignores meter', () => {
      const row = makeRow({
        waterMode: 'FLAT',
        waterPrev: 100,
        waterCurr: 999, // ignored
        waterFlatAmount: 300,
      });
      const rule = makeRule({ waterUnitPrice: 999, waterMinCharge: 0 });
      const result = computeRoomBilling(row, rule);
      expect(result.waterUnits).toBe(0);
      expect(result.waterUsageCharge).toBe(300);
    });

    test('electric flat uses electricFlatAmount directly', () => {
      const row = makeRow({
        electricMode: 'FLAT',
        electricPrev: 0,
        electricCurr: 9999,
        electricFlatAmount: 500,
      });
      const rule = makeRule({ electricUnitPrice: 999, electricMinCharge: 0 });
      const result = computeRoomBilling(row, rule);
      expect(result.electricUnits).toBe(0);
      expect(result.electricUsageCharge).toBe(500);
    });
  });

  // ── DISABLED mode ─────────────────────────────────────────────────────────

  describe('DISABLED mode', () => {
    test('water disabled → all zeros', () => {
      const row = makeRow({ waterMode: 'DISABLED', waterPrev: 100, waterCurr: 200 });
      const rule = makeRule({ waterUnitPrice: 10 });
      const result = computeRoomBilling(row, rule);
      expect(result.waterUnits).toBe(0);
      expect(result.waterUsageCharge).toBe(0);
      expect(result.waterServiceFee).toBe(0);
      expect(result.waterTotal).toBe(0);
    });

    test('electric disabled → all zeros', () => {
      const row = makeRow({ electricMode: 'DISABLED', electricPrev: 0, electricCurr: 9999 });
      const rule = makeRule({ electricUnitPrice: 5 });
      const result = computeRoomBilling(row, rule);
      expect(result.electricUnits).toBe(0);
      expect(result.electricUsageCharge).toBe(0);
      expect(result.electricTotal).toBe(0);
    });
  });

  // ── MANUAL mode ──────────────────────────────────────────────────────────

  describe('MANUAL mode', () => {
    test('water manual uses waterUnitsManual directly', () => {
      const row = makeRow({
        waterMode: 'MANUAL',
        waterPrev: null,
        waterCurr: null,
        waterUnitsManual: 75,
      });
      const rule = makeRule({ waterUnitPrice: 8 }); // 75 × 8 = 600
      const result = computeRoomBilling(row, rule);
      expect(result.waterUnits).toBe(75);
      expect(result.waterUsageCharge).toBe(600);
    });
  });

  // ── Service Fee Modes ─────────────────────────────────────────────────────

  describe('Service Fee modes', () => {
    test('NONE → 0 service fee', () => {
      const row = makeRow({ waterPrev: 100, waterCurr: 150 }); // 50 units
      const rule = makeRule({ waterUnitPrice: 10, waterServiceFeeMode: 'NONE', waterServiceFeeAmount: 50 });
      const result = computeRoomBilling(row, rule);
      expect(result.waterServiceFee).toBe(0);
    });

    test('FLAT_ROOM → fixed amount regardless of units', () => {
      const row = makeRow({ waterPrev: 100, waterCurr: 150 });
      const rule = makeRule({ waterUnitPrice: 10, waterServiceFeeMode: 'FLAT_ROOM', waterServiceFeeAmount: 200 });
      const result = computeRoomBilling(row, rule);
      expect(result.waterServiceFee).toBe(200);
    });

    test('PER_UNIT → units × amount', () => {
      const row = makeRow({ waterPrev: 100, waterCurr: 150 }); // 50 units
      const rule = makeRule({ waterUnitPrice: 10, waterServiceFeeMode: 'PER_UNIT', waterServiceFeeAmount: 3 });
      const result = computeRoomBilling(row, rule);
      expect(result.waterServiceFee).toBe(150); // 50 × 3
    });

    test('MANUAL_FEE → uses waterServiceFeeManual', () => {
      const row = makeRow({ waterPrev: 100, waterCurr: 150, waterServiceFeeManual: 77 });
      const rule = makeRule({ waterUnitPrice: 10, waterServiceFeeMode: 'MANUAL_FEE', waterServiceFeeAmount: 999 });
      const result = computeRoomBilling(row, rule);
      expect(result.waterServiceFee).toBe(77);
    });
  });

  // ── Proration ───────────────────────────────────────────────────────────

  describe('Prorated rent', () => {
    test('move-out mid-month: rent proportional to days', () => {
      const row = makeRow({
        rentAmount: 9000,
        moveOutDate: new Date('2026-05-15'),
        billingPeriod: { year: 2026, month: 5 },
      });
      const rule = makeRule();
      const result = computeRoomBilling(row, rule);
      // May has 31 days, tenant left day 15 → charged for 15 days (boundary to boundary)
      // May 1 00:00 local to May 15 00:00 UTC (offset) → ceil(14.29) = 15 days
      expect(result.proratedRent).toBeCloseTo(9000 * 15 / 31, 2);
    });

    test('move-in mid-month: rent from move-in to end of month', () => {
      const row = makeRow({
        rentAmount: 9000,
        moveInDate: new Date('2026-05-16'),
        billingPeriod: { year: 2026, month: 5 },
      });
      const rule = makeRule();
      const result = computeRoomBilling(row, rule);
      // From day 16 to day 31 → 15 days
      expect(result.proratedRent).toBeCloseTo(9000 * 15 / 31, 2);
    });

    test('full month: no proration', () => {
      const row = makeRow({ rentAmount: 9000 }); // no moveInDate/moveOutDate
      const rule = makeRule();
      const result = computeRoomBilling(row, rule);
      expect(result.proratedRent).toBeUndefined();
    });

    test('move-in + move-out same month', () => {
      const row = makeRow({
        rentAmount: 9000,
        moveInDate: new Date('2026-05-10'),
        moveOutDate: new Date('2026-05-25'),
        billingPeriod: { year: 2026, month: 5 },
      });
      const rule = makeRule();
      const result = computeRoomBilling(row, rule);
      // May 10 to May 25 = 15 days
      expect(result.proratedRent).toBeCloseTo(9000 * 15 / 31, 2);
    });
  });

  // ── totalDue calculation ─────────────────────────────────────────────────

  describe('totalDue', () => {
    test('includes rent + waterTotal + electricTotal + furniture + other', () => {
      const row = makeRow({
        rentAmount: 5000,
        waterPrev: 0, waterCurr: 100, // 100 units
        electricPrev: 0, electricCurr: 200, // 200 units
        furnitureFee: 200,
        otherFee: 300,
      });
      const rule = makeRule({ waterUnitPrice: 10, electricUnitPrice: 5 });
      const result = computeRoomBilling(row, rule);
      // water: 100 * 10 = 1000, electric: 200 * 5 = 1000, total = 5000 + 1000 + 1000 + 200 + 300
      expect(result.totalDue).toBe(7500);
    });
  });

  // ── Negative meter values ────────────────────────────────────────────────

  describe('negative meter rejection', () => {
    test('negative waterPrev throws', () => {
      const row = makeRow({ waterPrev: -50, waterCurr: 100 });
      const rule = makeRule();
      expect(() => computeRoomBilling(row, rule)).toThrow('มิเตอร์น้ำติดลบ');
    });

    test('negative waterCurr throws', () => {
      const row = makeRow({ waterPrev: 50, waterCurr: -100 });
      const rule = makeRule();
      expect(() => computeRoomBilling(row, rule)).toThrow('มิเตอร์น้ำติดลบ');
    });

    test('negative electricPrev throws', () => {
      const row = makeRow({ electricPrev: -10, electricCurr: 200 });
      const rule = makeRule();
      expect(() => computeRoomBilling(row, rule)).toThrow('มิเตอร์ไฟติดลบ');
    });
  });

  // ── computeCheckNotes ────────────────────────────────────────────────────

  describe('computeCheckNotes', () => {
    test('NORMAL mode: missing prev/curr returns warning', () => {
      const row = makeRow({ waterMode: 'NORMAL', waterPrev: null, waterCurr: 150 });
      const computed = { waterUnits: 50, electricUnits: 50 };
      const note = computeCheckNotes(row, computed);
      expect(note).toContain('น้ำ');
    });

    test('NORMAL mode: complete data returns null', () => {
      const row = makeRow({ waterMode: 'NORMAL', waterPrev: 100, waterCurr: 150 });
      const computed = { waterUnits: 50, electricUnits: 50 };
      const note = computeCheckNotes(row, computed);
      expect(note).toBeNull();
    });

    test('MANUAL mode: missing units_manual returns warning', () => {
      const row = makeRow({ waterMode: 'MANUAL', waterUnitsManual: null });
      const computed = { waterUnits: 0, electricUnits: 0 };
      const note = computeCheckNotes(row, computed);
      expect(note).toContain('MANUAL');
    });

    test('DISABLED mode: no warning even if prev/curr null', () => {
      const row = makeRow({ waterMode: 'DISABLED', waterPrev: null, waterCurr: null });
      const computed = { waterUnits: 0, electricUnits: 0 };
      const note = computeCheckNotes(row, computed);
      expect(note).toBeNull();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    test('water disabled in rule → all zeros even with meter values', () => {
      const row = makeRow({ waterPrev: 100, waterCurr: 200 });
      const rule = makeRule({ waterEnabled: false });
      const result = computeRoomBilling(row, rule);
      expect(result.waterTotal).toBe(0);
    });

    test('electric disabled in rule → all zeros', () => {
      const row = makeRow({ electricPrev: 0, electricCurr: 999 });
      const rule = makeRule({ electricEnabled: false });
      const result = computeRoomBilling(row, rule);
      expect(result.electricTotal).toBe(0);
    });

    test('both water and electric disabled', () => {
      const row = makeRow({ waterMode: 'DISABLED', electricMode: 'DISABLED' });
      const rule = makeRule();
      const result = computeRoomBilling(row, rule);
      expect(result.waterTotal).toBe(0);
      expect(result.electricTotal).toBe(0);
      expect(result.totalDue).toBe(10000); // rent only
    });
  });
});