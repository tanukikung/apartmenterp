/**
 * Billing Excel Import Parser
 *
 * Reads the new billing_template.xlsx format.
 *
 * Sheet structure (per ชั้น_N floor sheet):
 *   row 0 (index 0) — title "ข้อมูลบิล ชั้น X" (merged, skip)
 *   row 1 (index 1) — English column headers  ← header row
 *   row 2 (index 2) — Thai labels             (skip)
 *   row 3+ (index 3+) — actual room-billing data
 *
 * Floor sheet names: ชั้น_1 through ชั้น_8 (underscore, NOT space)
 *
 * CONFIG sheet: label-based lookup (col A = Thai label, col B = value)
 * ACCOUNTS sheet: header at index 1, data from index 3
 * RULES sheet: header at index 1, data from index 3
 * No ROOM_MASTER sheet in the new template.
 */

import * as XLSX from 'xlsx';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Output row schema — mirrors RoomBilling DB model (minus computed cols)
// year + month come from the caller (BillingPeriod), not from the sheet.
// ─────────────────────────────────────────────────────────────────────────────

export const roomBillingRowSchema = z.object({
  /** Excel `room` column, e.g. "798/1" */
  roomNo: z.string().min(1),
  floorSheetName: z.string(), // which ชั้น_N sheet this row came from

  // Account override (optional — only if this room uses a different account)
  recvAccountOverrideId: z.string().nullable(),

  // Rule override (optional — only if this room uses a different rule)
  ruleOverrideCode: z.string().nullable(),

  rentAmount: z.number(),

  // Water meter
  waterMode: z.enum(['NORMAL', 'MANUAL', 'DISABLED', 'FLAT', 'STEP']).default('NORMAL'),
  waterPrev: z.number().nullable(),
  waterCurr: z.number().nullable(),
  waterUnitsManual: z.number().nullable(),
  /** Computed by Excel (water_units) — imported as-is for audit */
  waterUnits: z.number().default(0),
  waterUsageCharge: z.number().default(0),
  waterServiceFeeManual: z.number().nullable(),
  waterServiceFee: z.number().default(0),
  waterTotal: z.number().default(0),

  // Electric meter
  electricMode: z.enum(['NORMAL', 'MANUAL', 'DISABLED', 'FLAT', 'STEP']).default('NORMAL'),
  electricPrev: z.number().nullable(),
  electricCurr: z.number().nullable(),
  electricUnitsManual: z.number().nullable(),
  electricUnits: z.number().default(0),
  electricUsageCharge: z.number().default(0),
  electricServiceFeeManual: z.number().nullable(),
  electricServiceFee: z.number().default(0),
  electricTotal: z.number().default(0),

  furnitureFee: z.number().default(0),
  otherFee: z.number().default(0),
  /** Declared total from Excel — for cross-check / warnings */
  totalDue: z.number().default(0),

  note: z.string().nullable(),
  checkNotes: z.string().nullable(),
  roomStatus: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export type RoomBillingRow = z.infer<typeof roomBillingRowSchema>;

export interface FloorParseResult {
  sheetName: string;
  rows: RoomBillingRow[];
  errors: Array<{ rowIndex: number; roomNo: string; error: string }>;
}

export interface WorkbookParseResult {
  floors: FloorParseResult[];
  totalRows: number;
  totalErrors: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Full workbook types — CONFIG, ACCOUNTS, RULES
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkbookConfig {
  billingYear: number;
  billingMonth: number;
  defaultAccountId: string;
  defaultRuleCode: string;
  defaultWaterMode: string;
  defaultElectricMode: string;
  waterFallbackRate: number;
  waterFallbackMin: number;
  electricFallbackRate: number;
  electricFallbackMin: number;
}

export interface AccountRow {
  id: string;
  accountName: string;
  bank: string;
  accountNumber: string;
  isDefault: boolean;
  note: string;
}

export interface RuleRow {
  code: string;
  description: string;
  waterMode: 'NORMAL' | 'MANUAL' | 'DISABLED' | 'FLAT' | 'STEP';
  waterRate: number;
  waterMinCharge: number;
  waterFlatAmount: number;
  waterS1Upto: number; waterS1Rate: number;
  waterS2Upto: number; waterS2Rate: number;
  waterS3Upto: number; waterS3Rate: number;
  waterFeeMode: 'NONE' | 'FLAT' | 'PER_UNIT' | 'MANUAL';
  waterFeeAmount: number;
  waterFeePerUnit: number;
  electricMode: 'NORMAL' | 'MANUAL' | 'DISABLED' | 'FLAT' | 'STEP';
  electricRate: number;
  electricMinCharge: number;
  electricFlatAmount: number;
  electricS1Upto: number; electricS1Rate: number;
  electricS2Upto: number; electricS2Rate: number;
  electricS3Upto: number; electricS3Rate: number;
  electricFeeMode: 'NONE' | 'FLAT' | 'PER_UNIT' | 'MANUAL';
  electricFeeAmount: number;
  electricFeePerUnit: number;
  note: string;
}

export interface FullWorkbookParseResult extends WorkbookParseResult {
  config: WorkbookConfig;
  accounts: AccountRow[];
  rules: RuleRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>;

function toNum(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function toNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = toNum(value);
  return Number.isFinite(n) ? n : null;
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function toMeterMode(value: unknown): 'NORMAL' | 'MANUAL' | 'DISABLED' | 'FLAT' | 'STEP' {
  const s = String(value ?? '').trim().toUpperCase();
  if (s === 'MANUAL') return 'MANUAL';
  if (s === 'DISABLED') return 'DISABLED';
  if (s === 'FLAT') return 'FLAT';
  if (s === 'STEP') return 'STEP';
  return 'NORMAL';
}

function toFeeMode(value: unknown): 'NONE' | 'FLAT' | 'PER_UNIT' | 'MANUAL' {
  const s = String(value ?? '').trim().toUpperCase();
  if (s === 'FLAT') return 'FLAT';
  if (s === 'PER_UNIT') return 'PER_UNIT';
  if (s === 'MANUAL') return 'MANUAL';
  return 'NONE';
}

function toRoomStatus(value: unknown): 'ACTIVE' | 'INACTIVE' {
  const s = String(value ?? '').trim().toUpperCase();
  return s === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

/**
 * Convert a raw row array (from header:1 read) into a RoomBillingRow.
 * headers[] must map positionally to the values.
 *
 * New column names (row 1 in new template):
 *   account_id, rule_code, water_charge, water_fee, water_fee_manual,
 *   electric_charge, electric_fee, electric_fee_manual
 * water_total = water_charge + water_fee  (no separate column)
 * electric_total = electric_charge + electric_fee
 */
function parseDataRow(
  headers: (string | null)[],
  values: unknown[],
  sheetName: string
): RoomBillingRow {
  // Build a name→value map using the English headers (row index 1)
  const row: RawRow = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h) row[h] = values[i] ?? null;
  }

  const waterCharge = toNum(row['water_charge']);
  const waterFee    = toNum(row['water_fee']);
  const electricCharge = toNum(row['electric_charge']);
  const electricFee    = toNum(row['electric_fee']);

  return roomBillingRowSchema.parse({
    roomNo:                   String(row['room'] ?? '').trim(),
    floorSheetName:           sheetName,
    recvAccountOverrideId:    toStr(row['recv_account_override_id'] ?? row['account_id']),
    ruleOverrideCode:         toStr(row['rule_override_code'] ?? row['rule_code']),
    rentAmount:               toNum(row['rent_amount']),
    waterMode:                toMeterMode(row['water_mode']),
    waterPrev:                toNumOrNull(row['water_prev']),
    waterCurr:                toNumOrNull(row['water_curr']),
    waterUnitsManual:         toNumOrNull(row['water_units_manual']),
    waterUnits:               toNum(row['water_units']),
    waterUsageCharge:         waterCharge,
    waterServiceFeeManual:    toNumOrNull(row['water_fee_manual']),
    waterServiceFee:          waterFee,
    waterTotal:               Math.round((waterCharge + waterFee) * 100) / 100,
    electricMode:             toMeterMode(row['electric_mode']),
    electricPrev:             toNumOrNull(row['electric_prev']),
    electricCurr:             toNumOrNull(row['electric_curr']),
    electricUnitsManual:      toNumOrNull(row['electric_units_manual']),
    electricUnits:            toNum(row['electric_units']),
    electricUsageCharge:      electricCharge,
    electricServiceFeeManual: toNumOrNull(row['electric_fee_manual']),
    electricServiceFee:       electricFee,
    electricTotal:            Math.round((electricCharge + electricFee) * 100) / 100,
    furnitureFee:             toNum(row['furniture_fee']),
    otherFee:                 toNum(row['other_fee']),
    totalDue:                 toNum(row['total_due']),
    note:                     toStr(row['note']),
    checkNotes:               toStr(row['check_notes']),
    roomStatus:               toRoomStatus(row['room_status']),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — floor sheets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a full billing workbook buffer.
 * Only ชั้น_N sheets (e.g. ชั้น_1 … ชั้น_8) are processed; all others are skipped.
 *
 * New row layout:
 *   index 0 — title (skip)
 *   index 1 — English headers (header row)
 *   index 2 — Thai labels (skip)
 *   index 3+ — data rows
 * Minimum rows required: 4 (title + EN-headers + TH-labels + 1 data row)
 */
export function parseBillingWorkbook(buffer: Uint8Array): WorkbookParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });

  const floorSheetNames = workbook.SheetNames.filter((n) =>
    /^ชั้น_\d+$/i.test(n)
  );

  const floors: FloorParseResult[] = [];
  let totalRows = 0;
  let totalErrors = 0;

  for (const sheetName of floorSheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Read as raw array so we control which row is the header
    const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    });

    // Need at least 4 rows: title, EN-headers, TH-labels, 1 data row
    if (allRows.length < 4) {
      floors.push({ sheetName, rows: [], errors: [] });
      continue;
    }

    // Row index 1 = English column headers
    const headers = (allRows[1] as (string | null)[]).map((h) =>
      h !== null ? String(h).trim() : null
    );

    // Row index 2 = Thai translation labels — skip
    // Rows index 3+ = data
    const dataRows = allRows.slice(3);

    const rows: RoomBillingRow[] = [];
    const errors: Array<{ rowIndex: number; roomNo: string; error: string }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const values = dataRows[i] as unknown[];
      // Skip completely empty rows (room column is null/empty)
      const roomVal = values[headers.indexOf('room')];
      if (!roomVal) continue;

      const rowIndex = i + 3; // 0-based sheet row index
      try {
        const parsed = parseDataRow(headers, values, sheetName);
        rows.push(parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ rowIndex, roomNo: String(roomVal), error: msg });
      }
    }

    floors.push({ sheetName, rows, errors });
    totalRows += rows.length;
    totalErrors += errors.length;
  }

  return { floors, totalRows, totalErrors };
}

/**
 * Convenience: get all successfully-parsed rows from all ชั้น_N sheets.
 */
export function parseAllFloorRows(buffer: Uint8Array): RoomBillingRow[] {
  const result = parseBillingWorkbook(buffer);
  return result.floors.flatMap((f) => f.rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet parsers for CONFIG / ACCOUNTS / RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the CONFIG sheet.
 * No header row. Col A = Thai label, col B = value.
 * Uses partial string match (includes) to find each label.
 * Skips rows where col A is empty.
 */
function parseConfigSheet(sheet: XLSX.WorkSheet): WorkbookConfig {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  // Build list of (label, value) pairs — skip empty col-A rows (including row 0 title)
  const pairs: Array<{ label: string; value: string }> = [];
  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i] as (string | number | null)[];
    const labelRaw = row[0];
    if (labelRaw === null || labelRaw === undefined) continue;
    const label = String(labelRaw).trim();
    if (!label) continue;
    const val = row[1] !== null && row[1] !== undefined ? String(row[1]).trim() : '';
    pairs.push({ label, value: val });
  }

  const find = (keyword: string): string => {
    const found = pairs.find((p) => p.label.includes(keyword));
    return found ? found.value : '';
  };

  const billingYear  = parseInt(find('ปี (ค.ศ.)'), 10);
  const billingMonth = parseInt(find('เดือน (1-12)'), 10);

  return {
    billingYear:          Number.isFinite(billingYear)  ? billingYear  : 0,
    billingMonth:         Number.isFinite(billingMonth) ? billingMonth : 0,
    defaultAccountId:     find('บัญชีรับเงิน (default)'),
    defaultRuleCode:      find('กฎ billing (default)'),
    defaultWaterMode:     find('โหมดน้ำ (default)'),
    defaultElectricMode:  find('โหมดไฟ (default)'),
    waterFallbackRate:    toNum(find('อัตราน้ำ fallback (บาท/หน่วย)')),
    waterFallbackMin:     toNum(find('ค่าน้ำขั้นต่ำ fallback (บาท)')),
    electricFallbackRate: toNum(find('อัตราไฟ fallback (บาท/หน่วย)')),
    electricFallbackMin:  toNum(find('ค่าไฟขั้นต่ำ fallback (บาท)')),
  };
}

/**
 * Parse the ACCOUNTS sheet.
 * Row 0 (index 0) = title (skip)
 * Row 1 (index 1) = English headers: id, account_name, bank, account_number, is_default, note
 * Row 2 (index 2) = Thai labels (skip)
 * Row 3+ (index 3+) = data
 */
function parseAccountsSheet(sheet: XLSX.WorkSheet): AccountRow[] {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 4) return [];

  // Row index 1 = English column headers
  const headers = (allRows[1] as (string | null)[]).map((h) =>
    h !== null ? String(h).trim() : null
  );

  const accounts: AccountRow[] = [];
  for (let i = 3; i < allRows.length; i++) {
    const values = allRows[i] as (string | number | null)[];
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (h) row[h] = values[j] ?? null;
    }

    const id = toStr(row['id']);
    if (!id) continue; // skip blank rows

    accounts.push({
      id,
      accountName:   toStr(row['account_name']) ?? '',
      bank:          toStr(row['bank']) ?? '',
      accountNumber: toStr(row['account_number']) ?? '',
      isDefault:     String(row['is_default'] ?? '').trim().toUpperCase() === 'YES',
      note:          toStr(row['note']) ?? '',
    });
  }

  return accounts;
}

/**
 * Parse the RULES sheet.
 * Row 0 (index 0) = title (skip)
 * Row 1 (index 1) = English headers (29 columns)
 * Row 2 (index 2) = Thai labels (skip)
 * Row 3+ (index 3+) = data
 */
function parseRulesSheet(sheet: XLSX.WorkSheet): RuleRow[] {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 4) return [];

  // Row index 1 = English column headers
  const headers = (allRows[1] as (string | null)[]).map((h) =>
    h !== null ? String(h).trim() : null
  );

  const rules: RuleRow[] = [];
  for (let i = 3; i < allRows.length; i++) {
    const values = allRows[i] as (string | number | null)[];
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (h) row[h] = values[j] ?? null;
    }

    const code = toStr(row['code']);
    if (!code) continue;

    rules.push({
      code,
      description:       toStr(row['description']) ?? '',
      waterMode:         toMeterMode(row['water_mode']),
      waterRate:         toNum(row['water_rate']),
      waterMinCharge:    toNum(row['water_min_charge']),
      waterFlatAmount:   toNum(row['water_flat_amount']),
      waterS1Upto:       toNum(row['water_s1_upto']),
      waterS1Rate:       toNum(row['water_s1_rate']),
      waterS2Upto:       toNum(row['water_s2_upto']),
      waterS2Rate:       toNum(row['water_s2_rate']),
      waterS3Upto:       toNum(row['water_s3_upto']),
      waterS3Rate:       toNum(row['water_s3_rate']),
      waterFeeMode:      toFeeMode(row['water_fee_mode']),
      waterFeeAmount:    toNum(row['water_fee_amount']),
      waterFeePerUnit:   toNum(row['water_fee_per_unit']),
      electricMode:      toMeterMode(row['electric_mode']),
      electricRate:      toNum(row['electric_rate']),
      electricMinCharge: toNum(row['electric_min_charge']),
      electricFlatAmount: toNum(row['electric_flat_amount']),
      electricS1Upto:    toNum(row['electric_s1_upto']),
      electricS1Rate:    toNum(row['electric_s1_rate']),
      electricS2Upto:    toNum(row['electric_s2_upto']),
      electricS2Rate:    toNum(row['electric_s2_rate']),
      electricS3Upto:    toNum(row['electric_s3_upto']),
      electricS3Rate:    toNum(row['electric_s3_rate']),
      electricFeeMode:   toFeeMode(row['electric_fee_mode']),
      electricFeeAmount: toNum(row['electric_fee_amount']),
      electricFeePerUnit: toNum(row['electric_fee_per_unit']),
      note:              toStr(row['note']) ?? '',
    });
  }

  return rules;
}

// ─────────────────────────────────────────────────────────────────────────────
// Full workbook parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse all sheets: CONFIG, ACCOUNTS, RULES, ชั้น_N.
 * Returns both the floor billing rows AND the master data sheets.
 * No ROOM_MASTER sheet in the new template.
 */
export function parseFullWorkbook(buffer: Uint8Array): FullWorkbookParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Parse floor sheets
  const base = parseBillingWorkbook(buffer);

  // Parse CONFIG sheet
  const configSheet = workbook.Sheets['CONFIG'];
  const config: WorkbookConfig = configSheet
    ? parseConfigSheet(configSheet)
    : {
        billingYear: 0,
        billingMonth: 0,
        defaultAccountId: '',
        defaultRuleCode: '',
        defaultWaterMode: 'NORMAL',
        defaultElectricMode: 'NORMAL',
        waterFallbackRate: 0,
        waterFallbackMin: 0,
        electricFallbackRate: 0,
        electricFallbackMin: 0,
      };

  // Parse ACCOUNTS sheet
  const accountsSheet = workbook.Sheets['ACCOUNTS'];
  const accounts: AccountRow[] = accountsSheet ? parseAccountsSheet(accountsSheet) : [];

  // Parse RULES sheet
  const rulesSheet = workbook.Sheets['RULES'];
  const rules: RuleRow[] = rulesSheet ? parseRulesSheet(rulesSheet) : [];

  return {
    ...base,
    config,
    accounts,
    rules,
  };
}

