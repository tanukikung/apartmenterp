import { describe, expect, it } from 'vitest';
import {
  computeRoomBilling,
  computeCheckNotes,
  type BillingRuleData,
  type RoomBillingRow,
} from '@/modules/billing/billing-calculator';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const standardRule: BillingRuleData = {
  waterEnabled: true,
  waterUnitPrice: 20,
  waterMinCharge: 100,
  waterServiceFeeMode: 'FLAT_ROOM',
  waterServiceFeeAmount: 20,

  electricEnabled: true,
  electricUnitPrice: 9,
  electricMinCharge: 45,
  electricServiceFeeMode: 'FLAT_ROOM',
  electricServiceFeeAmount: 20,
};

function baseRow(overrides: Partial<RoomBillingRow> = {}): RoomBillingRow {
  return {
    rentAmount: 3000,
    waterMode: 'NORMAL',
    waterPrev: 100,
    waterCurr: 110,
    waterUnitsManual: null,
    waterFlatAmount: undefined,
    waterServiceFeeManual: null,
    electricMode: 'NORMAL',
    electricPrev: 500,
    electricCurr: 550,
    electricUnitsManual: null,
    electricFlatAmount: undefined,
    electricServiceFeeManual: null,
    furnitureFee: 0,
    otherFee: 0,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Water tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRoomBilling — water', () => {
  it('NORMAL mode: units = curr - prev', () => {
    const result = computeRoomBilling(baseRow({ waterPrev: 100, waterCurr: 115 }), standardRule);
    expect(result.waterUnits).toBe(15);
    expect(result.waterUsageCharge).toBe(300); // 15 * 20
    expect(result.waterServiceFee).toBe(20);   // FLAT_ROOM
    expect(result.waterTotal).toBe(320);
  });

  it('NORMAL mode: applies waterMinCharge when usage is below minimum', () => {
    // 2 units * 20 = 40, but min is 100
    const result = computeRoomBilling(
      baseRow({ waterPrev: 100, waterCurr: 102 }),
      standardRule
    );
    expect(result.waterUnits).toBe(2);
    expect(result.waterUsageCharge).toBe(100); // min charge applied
    expect(result.waterTotal).toBe(120);        // 100 + 20 flat fee
  });

  it('MANUAL mode: uses waterUnitsManual instead of prev/curr', () => {
    const result = computeRoomBilling(
      baseRow({ waterMode: 'MANUAL', waterUnitsManual: 12, waterPrev: null, waterCurr: null }),
      standardRule
    );
    expect(result.waterUnits).toBe(12);
    expect(result.waterUsageCharge).toBe(240); // 12 * 20
    expect(result.waterServiceFee).toBe(20);
    expect(result.waterTotal).toBe(260);
  });

  it('MANUAL mode: defaults to 0 units when waterUnitsManual is null', () => {
    const result = computeRoomBilling(
      baseRow({ waterMode: 'MANUAL', waterUnitsManual: null }),
      standardRule
    );
    expect(result.waterUnits).toBe(0);
    // FIX: min charge NOT applied when units = 0 (a room without a water meter
    // should not be charged the minimum water fee)
    expect(result.waterUsageCharge).toBe(0);
  });

  it('water disabled: all water fields are 0', () => {
    const rule: BillingRuleData = { ...standardRule, waterEnabled: false };
    const result = computeRoomBilling(baseRow(), rule);
    expect(result.waterUnits).toBe(0);
    expect(result.waterUsageCharge).toBe(0);
    expect(result.waterServiceFee).toBe(0);
    expect(result.waterTotal).toBe(0);
  });

  it('NORMAL mode: units clamped to 0 when curr < prev (negative reading)', () => {
    const result = computeRoomBilling(
      baseRow({ waterPrev: 200, waterCurr: 190 }),
      standardRule
    );
    expect(result.waterUnits).toBe(0);
    // FIX: min charge NOT applied when units = 0 (meter rollback/correction
    // should not incur minimum charge)
    expect(result.waterUsageCharge).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Service fee mode tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRoomBilling — service fee modes', () => {
  it('FLAT_ROOM service fee: fixed amount regardless of units', () => {
    const rule: BillingRuleData = { ...standardRule, waterServiceFeeMode: 'FLAT_ROOM', waterServiceFeeAmount: 50 };
    const result = computeRoomBilling(baseRow({ waterPrev: 100, waterCurr: 200 }), rule);
    expect(result.waterServiceFee).toBe(50);
  });

  it('PER_UNIT service fee: fee = units * amount', () => {
    const rule: BillingRuleData = { ...standardRule, waterServiceFeeMode: 'PER_UNIT', waterServiceFeeAmount: 3 };
    const result = computeRoomBilling(baseRow({ waterPrev: 100, waterCurr: 110 }), rule);
    // 10 units * 3 = 30
    expect(result.waterServiceFee).toBe(30);
  });

  it('MANUAL_FEE service fee: uses waterServiceFeeManual', () => {
    const rule: BillingRuleData = {
      ...standardRule,
      waterServiceFeeMode: 'MANUAL_FEE',
      waterServiceFeeAmount: 0,
    };
    const result = computeRoomBilling(
      baseRow({ waterServiceFeeManual: 75 }),
      rule
    );
    expect(result.waterServiceFee).toBe(75);
  });

  it('MANUAL_FEE service fee: defaults to 0 when waterServiceFeeManual is null', () => {
    const rule: BillingRuleData = {
      ...standardRule,
      waterServiceFeeMode: 'MANUAL_FEE',
      waterServiceFeeAmount: 0,
    };
    const result = computeRoomBilling(
      baseRow({ waterServiceFeeManual: null }),
      rule
    );
    expect(result.waterServiceFee).toBe(0);
  });

  it('NONE service fee: always 0', () => {
    const rule: BillingRuleData = { ...standardRule, waterServiceFeeMode: 'NONE', waterServiceFeeAmount: 99 };
    const result = computeRoomBilling(baseRow(), rule);
    expect(result.waterServiceFee).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Electric tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRoomBilling — electric', () => {
  it('NORMAL mode: units = curr - prev', () => {
    const result = computeRoomBilling(
      baseRow({ electricPrev: 500, electricCurr: 570 }),
      standardRule
    );
    expect(result.electricUnits).toBe(70);
    expect(result.electricUsageCharge).toBe(630); // 70 * 9
    expect(result.electricServiceFee).toBe(20);
    expect(result.electricTotal).toBe(650);
  });

  it('MANUAL mode: uses electricUnitsManual', () => {
    const result = computeRoomBilling(
      baseRow({
        electricMode: 'MANUAL',
        electricUnitsManual: 80,
        electricPrev: null,
        electricCurr: null,
      }),
      standardRule
    );
    expect(result.electricUnits).toBe(80);
    expect(result.electricUsageCharge).toBe(720); // 80 * 9
  });

  it('electric disabled: all electric fields are 0', () => {
    const rule: BillingRuleData = { ...standardRule, electricEnabled: false };
    const result = computeRoomBilling(baseRow(), rule);
    expect(result.electricUnits).toBe(0);
    expect(result.electricUsageCharge).toBe(0);
    expect(result.electricServiceFee).toBe(0);
    expect(result.electricTotal).toBe(0);
  });

  it('applies electricMinCharge when usage is below minimum', () => {
    // 3 units * 9 = 27, min = 45
    const result = computeRoomBilling(
      baseRow({ electricPrev: 500, electricCurr: 503 }),
      standardRule
    );
    expect(result.electricUnits).toBe(3);
    expect(result.electricUsageCharge).toBe(45); // min applied
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Total due calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRoomBilling — totalDue', () => {
  it('totalDue = rent + waterTotal + electricTotal + furniture + other', () => {
    const row = baseRow({
      rentAmount: 3000,
      waterPrev: 100,
      waterCurr: 110,   // 10 units * 20 = 200, +20 flat = 220
      electricPrev: 500,
      electricCurr: 550, // 50 units * 9 = 450, +20 flat = 470
      furnitureFee: 300,
      otherFee: 50,
    });
    const result = computeRoomBilling(row, standardRule);
    expect(result.totalDue).toBe(3000 + result.waterTotal + result.electricTotal + 300 + 50);
  });

  it('totalDue is correct when both utilities are disabled', () => {
    const rule: BillingRuleData = {
      ...standardRule,
      waterEnabled: false,
      electricEnabled: false,
    };
    const row = baseRow({ rentAmount: 5000, furnitureFee: 500, otherFee: 200 });
    const result = computeRoomBilling(row, rule);
    expect(result.totalDue).toBe(5700);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCheckNotes
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCheckNotes', () => {
  const okComputed = { waterUnits: 10, electricUnits: 50 };

  it('returns null when NORMAL mode with valid prev/curr', () => {
    const row = baseRow({ waterPrev: 100, waterCurr: 110, electricPrev: 500, electricCurr: 550 });
    expect(computeCheckNotes(row, okComputed)).toBeNull();
  });

  it('warns when NORMAL water mode but prev is null', () => {
    const row = baseRow({ waterPrev: null, waterCurr: 110 });
    const notes = computeCheckNotes(row, okComputed);
    expect(notes).not.toBeNull();
    expect(notes).toContain('น้ำ');
    expect(notes).toContain('prev/curr');
  });

  it('warns when NORMAL water mode but curr is null', () => {
    const row = baseRow({ waterPrev: 100, waterCurr: null });
    const notes = computeCheckNotes(row, okComputed);
    expect(notes).toContain('น้ำ');
  });

  it('warns when NORMAL electric mode but prev/curr are null', () => {
    const row = baseRow({ electricPrev: null, electricCurr: null });
    const notes = computeCheckNotes(row, okComputed);
    expect(notes).toContain('ไฟ');
  });

  it('warns when MANUAL water mode but waterUnitsManual is null', () => {
    const row = baseRow({ waterMode: 'MANUAL', waterUnitsManual: null });
    const notes = computeCheckNotes(row, okComputed);
    expect(notes).toContain('น้ำ');
    expect(notes).toContain('MANUAL');
  });

  it('warns when MANUAL electric mode but electricUnitsManual is null', () => {
    const row = baseRow({ electricMode: 'MANUAL', electricUnitsManual: null });
    const notes = computeCheckNotes(row, okComputed);
    expect(notes).toContain('ไฟ');
    expect(notes).toContain('MANUAL');
  });

  it('returns null when MANUAL mode with units provided', () => {
    const row = baseRow({
      waterMode: 'MANUAL',
      waterUnitsManual: 5,
      electricMode: 'MANUAL',
      electricUnitsManual: 10,
    });
    expect(computeCheckNotes(row, okComputed)).toBeNull();
  });

  it('combines multiple warnings with semicolon separator', () => {
    const row = baseRow({ waterPrev: null, waterCurr: null, electricPrev: null, electricCurr: null });
    const notes = computeCheckNotes(row, okComputed);
    expect(notes).not.toBeNull();
    expect(notes!.split(';').length).toBe(2);
  });
});
