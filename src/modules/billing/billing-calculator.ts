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
  // Water STEP tiers
  waterS1Upto?: number | null;
  waterS1Rate?: number | null;
  waterS2Upto?: number | null;
  waterS2Rate?: number | null;
  waterS3Rate?: number | null;

  electricEnabled: boolean;
  electricUnitPrice: number;
  electricMinCharge: number;
  electricServiceFeeMode: ServiceFeeMode;
  electricServiceFeeAmount: number;
  // Electric STEP tiers
  electricS1Upto?: number | null;
  electricS1Rate?: number | null;
  electricS2Upto?: number | null;
  electricS2Rate?: number | null;
  electricS3Rate?: number | null;
}

export interface RoomBillingRow {
  rentAmount: number;

  // Optional proration fields — when a tenant moves in/out mid-month,
  // the billing system calculates rent proportional to actual occupancy days
  moveInDate?: Date | null;
  moveOutDate?: Date | null;
  // Billing period context — needed to determine period boundaries for proration
  billingPeriod?: { year: number; month: number };

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

  // Prorated rent — present only when move-in/move-out mid-month
  proratedRent?: number;
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
// Tiered charge helper — used for STEP mode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tiered (STEP) pricing:
 * Tier 1: 0 → s1Upto units at s1Rate
 * Tier 2: s1Upto → s2Upto units at s2Rate
 * Tier 3: above s2Upto units at s3Rate
 */
function computeTieredCharge(
  units: number,
  s1Upto: number | null | undefined,
  s1Rate: number | null | undefined,
  s2Upto: number | null | undefined,
  s2Rate: number | null | undefined,
  s3Rate: number | null | undefined,
): number {
  if (!units || !s1Upto || !s1Rate) return 0;

  const tier1Units = Math.min(units, s1Upto);
  let charge = tier1Units * s1Rate;

  const remainingAfterTier1 = units - s1Upto;
  if (remainingAfterTier1 <= 0) {
    return roundMoney(charge);
  }

  // Tier 2
  if (s2Upto && s2Rate) {
    const tier2Units = Math.min(remainingAfterTier1, s2Upto);
    charge += tier2Units * s2Rate;
    const remainingAfterTier2 = remainingAfterTier1 - s2Upto;
    if (remainingAfterTier2 > 0 && s3Rate) {
      charge += remainingAfterTier2 * s3Rate;
    }
  } else if (s3Rate) {
    charge += remainingAfterTier1 * s3Rate;
  }

  return roundMoney(charge);
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
    | 'waterS1Upto'
    | 'waterS1Rate'
    | 'waterS2Upto'
    | 'waterS2Rate'
    | 'waterS3Rate'
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

  // Reject negative meter readings — an IoT sensor that sends a negative value
  // should trigger an investigation, not silently compute zero usage.
  // Note: curr < prev (meter was reset/replaced) is handled by the parser layer
  // and will produce units = 0 through the Math.max below. We only throw for
  // truly negative absolute readings.
  if ((row.waterPrev ?? 0) < 0 || (row.waterCurr ?? 0) < 0) {
    throw new Error(`มิเตอร์น้ำติดลบ: ค่าก่อน=${row.waterPrev ?? 0}, ค่าปัจจุบัน=${row.waterCurr ?? 0}`);
  }

  // STEP = tiered pricing
  if (row.waterMode === 'STEP') {
    const waterUnits = Math.max(0, (row.waterCurr ?? 0) - (row.waterPrev ?? 0));
    const waterUsageCharge = waterUnits > 0
      ? roundMoney(computeTieredCharge(
          waterUnits,
          rule.waterS1Upto,
          rule.waterS1Rate,
          rule.waterS2Upto,
          rule.waterS2Rate,
          rule.waterS3Rate,
        ))
      : 0;
    const afterMin = rule.waterMinCharge > 0 ? Math.max(waterUsageCharge, rule.waterMinCharge) : waterUsageCharge;
    const waterServiceFee = computeServiceFee(
      rule.waterServiceFeeMode,
      rule.waterServiceFeeAmount,
      waterUnits,
      row.waterServiceFeeManual
    );
    return { waterUnits, waterUsageCharge: afterMin, waterServiceFee, waterTotal: roundMoney(afterMin + waterServiceFee) };
  }

  // NORMAL or MANUAL: linear pricing
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
    | 'electricS1Upto'
    | 'electricS1Rate'
    | 'electricS2Upto'
    | 'electricS2Rate'
    | 'electricS3Rate'
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

  // Reject negative meter readings — an IoT sensor that sends a negative value
  // should trigger an investigation, not silently compute zero usage
  if ((row.electricPrev ?? 0) < 0 || (row.electricCurr ?? 0) < 0) {
    throw new Error(`มิเตอร์ไฟติดลบ: ค่าก่อน=${row.electricPrev ?? 0}, ค่าปัจจุบัน=${row.electricCurr ?? 0}`);
  }

  // STEP = tiered pricing
  if (row.electricMode === 'STEP') {
    const electricUnits = Math.max(0, (row.electricCurr ?? 0) - (row.electricPrev ?? 0));
    const electricUsageCharge = electricUnits > 0
      ? roundMoney(computeTieredCharge(
          electricUnits,
          rule.electricS1Upto,
          rule.electricS1Rate,
          rule.electricS2Upto,
          rule.electricS2Rate,
          rule.electricS3Rate,
        ))
      : 0;
    const afterMin = rule.electricMinCharge > 0 ? Math.max(electricUsageCharge, rule.electricMinCharge) : electricUsageCharge;
    const electricServiceFee = computeServiceFee(
      rule.electricServiceFeeMode,
      rule.electricServiceFeeAmount,
      electricUnits,
      row.electricServiceFeeManual
    );
    return { electricUnits, electricUsageCharge: afterMin, electricServiceFee, electricTotal: roundMoney(afterMin + electricServiceFee) };
  }

  // NORMAL or MANUAL: linear pricing
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

  // Prorated rent: if the tenant moved in/out mid-month, charge only actual occupancy days.
  // Handles three cases:
  // 1. move-out only: tenant left during this billing period → charge from period start to move-out
  // 2. move-in only: tenant arrived during this billing period → charge from move-in to period end
  // 3. both in same period: charge for actual days between move-in and move-out
  let rentAmount = row.rentAmount;
  if (row.moveInDate || row.moveOutDate) {
    if (!row.billingPeriod) {
      throw new Error('billingPeriod is required when moveInDate or moveOutDate is set');
    }
    // Period boundaries
    const periodStart = new Date(row.billingPeriod.year, row.billingPeriod.month - 1, 1);
    const periodEnd = new Date(row.billingPeriod.year, row.billingPeriod.month, 0);
    const daysInMonth = periodEnd.getDate();

    let occupancyDays: number;
    if (row.moveInDate && row.moveOutDate) {
      // Both: use actual occupancy window (e.g. move in and out within same month)
      occupancyDays = Math.max(1, Math.ceil((row.moveOutDate.getTime() - row.moveInDate.getTime()) / 86_400_000));
    } else if (row.moveOutDate) {
      // Move-out only: from period start to move-out date
      const moveOut = row.moveOutDate;
      occupancyDays = Math.max(1, Math.ceil((moveOut.getTime() - periodStart.getTime()) / 86_400_000));
    } else if (row.moveInDate) {
      // Move-in only: from move-in date to period end
      const moveIn = row.moveInDate;
      occupancyDays = Math.max(1, Math.ceil((periodEnd.getTime() - moveIn.getTime()) / 86_400_000));
    } else {
      occupancyDays = daysInMonth;
    }
    rentAmount = roundMoney((row.rentAmount / daysInMonth) * occupancyDays);
  }

  const totalDue = roundMoney(
    rentAmount +
    water.waterTotal +
    electric.electricTotal +
    row.furnitureFee +
    row.otherFee
  );

  return {
    ...water,
    ...electric,
    totalDue,
    // Expose prorated fields so the service layer can detect partial-month billing
    proratedRent: rentAmount !== row.rentAmount ? rentAmount : undefined,
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
