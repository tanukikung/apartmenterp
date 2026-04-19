/**
 * Billing Calculator — pure functions, no DB or framework imports.
 *
 * Computes water/electric charges from raw meter readings + billing rules.
 * These functions are the source of truth; Excel-computed columns are ignored.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ServiceFeeMode = 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE';
export type MeterMode = 'NORMAL' | 'MANUAL' | 'DISABLED' | 'FLAT' | 'STEP';

export interface BillingRuleData {
  waterEnabled: boolean;
  waterUnitPrice: number;
  waterMinCharge: number;
  waterServiceFeeMode: ServiceFeeMode;
  waterServiceFeeAmount: number;

  electricEnabled: boolean;
  electricUnitPrice: number;
  electricMinCharge: number;
  electricServiceFeeMode: ServiceFeeMode;
  electricServiceFeeAmount: number;
}

export interface RoomBillingRow {
  rentAmount: number;

  waterMode: MeterMode;
  waterPrev: number | null;
  waterCurr: number | null;
  waterUnitsManual: number | null;
  waterFlatAmount?: number | null;   // flat rate amount (used when waterMode = FLAT)
  waterServiceFeeManual: number | null;

  electricMode: MeterMode;
  electricPrev: number | null;
  electricCurr: number | null;
  electricUnitsManual: number | null;
  electricFlatAmount?: number | null; // flat rate amount (used when electricMode = FLAT)
  electricServiceFeeManual: number | null;

  furnitureFee: number;
  otherFee: number;
}

export interface ComputedBilling {
  // Water
  waterUnits: number;
  waterUsageCharge: number;
  waterServiceFee: number;
  waterTotal: number;

  // Electric
  electricUnits: number;
  electricUsageCharge: number;
  electricServiceFee: number;
  electricTotal: number;

  // Grand total
  totalDue: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Money rounding — avoid float precision errors before storing to Decimal(10,2)
// ─────────────────────────────────────────────────────────────────────────────

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeServiceFee(
  mode: ServiceFeeMode,
  amount: number,
  units: number,
  manualFee: number | null
): number {
  switch (mode) {
    case 'NONE':
      return 0;
    case 'FLAT_ROOM':
      return amount;
    case 'PER_UNIT':
      return roundMoney(units * amount);
    case 'MANUAL_FEE':
      return manualFee ?? 0;
    default:
      return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Water computation
// ─────────────────────────────────────────────────────────────────────────────

function computeWater(
  row: Pick<
    RoomBillingRow,
    | 'waterMode'
    | 'waterPrev'
    | 'waterCurr'
    | 'waterUnitsManual'
    | 'waterFlatAmount'
    | 'waterServiceFeeManual'
  >,
  rule: Pick<
    BillingRuleData,
    | 'waterEnabled'
    | 'waterUnitPrice'
    | 'waterMinCharge'
    | 'waterServiceFeeMode'
    | 'waterServiceFeeAmount'
  >
): { waterUnits: number; waterUsageCharge: number; waterServiceFee: number; waterTotal: number } {
  // DISABLED = ไม่คิดค่าน้ำเลย
  if (!rule.waterEnabled || row.waterMode === 'DISABLED') {
    return { waterUnits: 0, waterUsageCharge: 0, waterServiceFee: 0, waterTotal: 0 };
  }

  // FLAT = เหมาจ่าย ไม่ดูมิเตอร์
  if (row.waterMode === 'FLAT') {
    const waterUsageCharge = row.waterFlatAmount ?? 0;
    const waterServiceFee = computeServiceFee(
      rule.waterServiceFeeMode,
      rule.waterServiceFeeAmount,
      0, // units = 0 for flat
      row.waterServiceFeeManual
    );
    return { waterUnits: 0, waterUsageCharge, waterServiceFee, waterTotal: roundMoney(waterUsageCharge + waterServiceFee) };
  }

  // STEP = tiered pricing (future extension — treat as NORMAL for now)
  // NORMAL or STEP: ใช้ curr - prev
  const waterUnits =
    row.waterMode === 'MANUAL'
      ? (row.waterUnitsManual ?? 0)
      : Math.max(0, (row.waterCurr ?? 0) - (row.waterPrev ?? 0));

  const waterUsageCharge = waterUnits > 0
    ? roundMoney(Math.max(waterUnits * rule.waterUnitPrice, rule.waterMinCharge))
    : 0;

  const waterServiceFee = computeServiceFee(
    rule.waterServiceFeeMode,
    rule.waterServiceFeeAmount,
    waterUnits,
    row.waterServiceFeeManual
  );

  const waterTotal = roundMoney(waterUsageCharge + waterServiceFee);

  return { waterUnits, waterUsageCharge, waterServiceFee, waterTotal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Electric computation
// ─────────────────────────────────────────────────────────────────────────────

function computeElectric(
  row: Pick<
    RoomBillingRow,
    | 'electricMode'
    | 'electricPrev'
    | 'electricCurr'
    | 'electricUnitsManual'
    | 'electricFlatAmount'
    | 'electricServiceFeeManual'
  >,
  rule: Pick<
    BillingRuleData,
    | 'electricEnabled'
    | 'electricUnitPrice'
    | 'electricMinCharge'
    | 'electricServiceFeeMode'
    | 'electricServiceFeeAmount'
  >
): {
  electricUnits: number;
  electricUsageCharge: number;
  electricServiceFee: number;
  electricTotal: number;
} {
  // DISABLED = ไม่คิดค่าไฟเลย
  if (!rule.electricEnabled || row.electricMode === 'DISABLED') {
    return { electricUnits: 0, electricUsageCharge: 0, electricServiceFee: 0, electricTotal: 0 };
  }

  // FLAT = เหมาจ่าย ไม่ดูมิเตอร์
  if (row.electricMode === 'FLAT') {
    const electricUsageCharge = row.electricFlatAmount ?? 0;
    const electricServiceFee = computeServiceFee(
      rule.electricServiceFeeMode,
      rule.electricServiceFeeAmount,
      0,
      row.electricServiceFeeManual
    );
    return { electricUnits: 0, electricUsageCharge, electricServiceFee, electricTotal: roundMoney(electricUsageCharge + electricServiceFee) };
  }

  // STEP = tiered pricing (future extension — treat as NORMAL for now)
  const electricUnits =
    row.electricMode === 'MANUAL'
      ? (row.electricUnitsManual ?? 0)
      : Math.max(0, (row.electricCurr ?? 0) - (row.electricPrev ?? 0));

  const electricUsageCharge = electricUnits > 0
    ? roundMoney(Math.max(electricUnits * rule.electricUnitPrice, rule.electricMinCharge))
    : 0;

  const electricServiceFee = computeServiceFee(
    rule.electricServiceFeeMode,
    rule.electricServiceFeeAmount,
    electricUnits,
    row.electricServiceFeeManual
  );

  const electricTotal = roundMoney(electricUsageCharge + electricServiceFee);

  return { electricUnits, electricUsageCharge, electricServiceFee, electricTotal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute all billing amounts for a single room row + rule.
 * Returns a ComputedBilling with every calculated field.
 */
export function computeRoomBilling(
  row: RoomBillingRow,
  rule: BillingRuleData
): ComputedBilling {
  const water = computeWater(row, rule);
  const electric = computeElectric(row, rule);

  const totalDue = roundMoney(
    row.rentAmount +
    water.waterTotal +
    electric.electricTotal +
    row.furnitureFee +
    row.otherFee
  );

  return {
    ...water,
    ...electric,
    totalDue,
  };
}

/**
 * Return a Thai-language warning string if the row has incomplete meter data.
 * Returns null if everything is fine.
 */
export function computeCheckNotes(
  row: Pick<
    RoomBillingRow,
    | 'waterMode'
    | 'waterPrev'
    | 'waterCurr'
    | 'waterUnitsManual'
    | 'electricMode'
    | 'electricPrev'
    | 'electricCurr'
    | 'electricUnitsManual'
  >,
  _computed: Pick<ComputedBilling, 'waterUnits' | 'electricUnits'>
): string | null {
  const warnings: string[] = [];

  // Water warnings — only NORMAL and MANUAL need data; FLAT/DISABLED/STEP don't
  if (row.waterMode === 'NORMAL') {
    if (row.waterPrev === null || row.waterCurr === null) {
      warnings.push('น้ำ: ต้องกรอก prev/curr');
    }
  } else if (row.waterMode === 'MANUAL') {
    if (row.waterUnitsManual === null) {
      warnings.push('น้ำ: ต้องกรอก units_manual (MANUAL mode)');
    }
  }

  // Electric warnings
  if (row.electricMode === 'NORMAL') {
    if (row.electricPrev === null || row.electricCurr === null) {
      warnings.push('ไฟ: ต้องกรอก prev/curr');
    }
  } else if (row.electricMode === 'MANUAL') {
    if (row.electricUnitsManual === null) {
      warnings.push('ไฟ: ต้องกรอก units_manual (MANUAL mode)');
    }
  }

  // Note: computed param is intentionally unused — validation checks row-level fields only.
  // The computed water/electric units are validated indirectly via row mode checks above.

  return warnings.length > 0 ? warnings.join('; ') : null;
}
