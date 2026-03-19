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

  waterMode: 'NORMAL' | 'MANUAL';
  waterPrev: number | null;
  waterCurr: number | null;
  waterUnitsManual: number | null;
  waterServiceFeeManual: number | null;

  electricMode: 'NORMAL' | 'MANUAL';
  electricPrev: number | null;
  electricCurr: number | null;
  electricUnitsManual: number | null;
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
      return units * amount;
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
    'waterMode' | 'waterPrev' | 'waterCurr' | 'waterUnitsManual' | 'waterServiceFeeManual'
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
  if (!rule.waterEnabled) {
    return { waterUnits: 0, waterUsageCharge: 0, waterServiceFee: 0, waterTotal: 0 };
  }

  const waterUnits =
    row.waterMode === 'MANUAL'
      ? (row.waterUnitsManual ?? 0)
      : Math.max(0, (row.waterCurr ?? 0) - (row.waterPrev ?? 0));

  const waterUsageCharge = Math.max(waterUnits * rule.waterUnitPrice, rule.waterMinCharge);

  const waterServiceFee = computeServiceFee(
    rule.waterServiceFeeMode,
    rule.waterServiceFeeAmount,
    waterUnits,
    row.waterServiceFeeManual
  );

  const waterTotal = waterUsageCharge + waterServiceFee;

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
  if (!rule.electricEnabled) {
    return { electricUnits: 0, electricUsageCharge: 0, electricServiceFee: 0, electricTotal: 0 };
  }

  const electricUnits =
    row.electricMode === 'MANUAL'
      ? (row.electricUnitsManual ?? 0)
      : Math.max(0, (row.electricCurr ?? 0) - (row.electricPrev ?? 0));

  const electricUsageCharge = Math.max(
    electricUnits * rule.electricUnitPrice,
    rule.electricMinCharge
  );

  const electricServiceFee = computeServiceFee(
    rule.electricServiceFeeMode,
    rule.electricServiceFeeAmount,
    electricUnits,
    row.electricServiceFeeManual
  );

  const electricTotal = electricUsageCharge + electricServiceFee;

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

  const totalDue =
    row.rentAmount +
    water.waterTotal +
    electric.electricTotal +
    row.furnitureFee +
    row.otherFee;

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
  computed: Pick<ComputedBilling, 'waterUnits' | 'electricUnits'>
): string | null {
  const warnings: string[] = [];

  // Water warnings
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

  // Suppress unused param lint
  void computed;

  return warnings.length > 0 ? warnings.join('; ') : null;
}
