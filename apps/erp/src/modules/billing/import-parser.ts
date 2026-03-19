/**
 * Billing Excel Import Parser
 *
 * Reads the official apartment_excel_template.xlsx format.
 *
 * Sheet structure (per FLOOR_x sheet):
 *   row 0  — title  "FLOOR_x — กรอกช่องเหลืองเท่านั้น"  (skip)
 *   row 1  — instructions in Thai                          (skip)
 *   row 2  — English column headers (room, water_mode …)  ← header row
 *   row 3  — Thai translation labels                       (skip)
 *   row 4+ — actual room-billing data
 *
 * Only FLOOR_* sheets are parsed; all others (CONFIG, ACCOUNTS, RULES,
 * ROOM_MASTER, DICTIONARY, README, _VALIDATION) are ignored.
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
  floorSheetName: z.string(), // which FLOOR_x sheet this row came from

  // Account override (optional — only if this room uses a different account)
  recvAccountOverrideId: z.string().nullable(),

  // Rule override (optional — only if this room uses a different rule)
  ruleOverrideCode: z.string().nullable(),

  rentAmount: z.number(),

  // Water meter
  waterMode: z.enum(['NORMAL', 'MANUAL']).default('NORMAL'),
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
  electricMode: z.enum(['NORMAL', 'MANUAL']).default('NORMAL'),
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

function toMeterMode(value: unknown): 'NORMAL' | 'MANUAL' {
  const s = String(value ?? '').trim().toUpperCase();
  return s === 'MANUAL' ? 'MANUAL' : 'NORMAL';
}

function toRoomStatus(value: unknown): 'ACTIVE' | 'INACTIVE' {
  const s = String(value ?? '').trim().toUpperCase();
  return s === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

/**
 * Convert a raw row array (from `header:1` read) into a RoomBillingRow.
 * headers[] must map positionally to the values.
 */
function parseDataRow(
  headers: (string | null)[],
  values: unknown[],
  sheetName: string
): RoomBillingRow {
  // Build a name→value map using the English headers (row 2)
  const row: RawRow = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h) row[h] = values[i] ?? null;
  }

  return roomBillingRowSchema.parse({
    roomNo:                  String(row['room'] ?? '').trim(),
    floorSheetName:          sheetName,
    recvAccountOverrideId:   toStr(row['recv_account_override_id']),
    ruleOverrideCode:        toStr(row['rule_override_code']),
    rentAmount:              toNum(row['rent_amount']),
    waterMode:               toMeterMode(row['water_mode']),
    waterPrev:               toNumOrNull(row['water_prev']),
    waterCurr:               toNumOrNull(row['water_curr']),
    waterUnitsManual:        toNumOrNull(row['water_units_manual']),
    waterUnits:              toNum(row['water_units']),
    waterUsageCharge:        toNum(row['water_usage_charge']),
    waterServiceFeeManual:   toNumOrNull(row['water_service_fee_manual']),
    waterServiceFee:         toNum(row['water_service_fee']),
    waterTotal:              toNum(row['water_total']),
    electricMode:            toMeterMode(row['electric_mode']),
    electricPrev:            toNumOrNull(row['electric_prev']),
    electricCurr:            toNumOrNull(row['electric_curr']),
    electricUnitsManual:     toNumOrNull(row['electric_units_manual']),
    electricUnits:           toNum(row['electric_units']),
    electricUsageCharge:     toNum(row['electric_usage_charge']),
    electricServiceFeeManual: toNumOrNull(row['electric_service_fee_manual']),
    electricServiceFee:      toNum(row['electric_service_fee']),
    electricTotal:           toNum(row['electric_total']),
    furnitureFee:            toNum(row['furniture_fee']),
    otherFee:                toNum(row['other_fee']),
    totalDue:                toNum(row['total_due']),
    note:                    toStr(row['note']),
    checkNotes:              toStr(row['check_notes']),
    roomStatus:              toRoomStatus(row['room_status']),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a full billing workbook buffer.
 * Only FLOOR_* sheets are processed; all others are silently skipped.
 */
export function parseBillingWorkbook(buffer: Uint8Array): WorkbookParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });

  const floorSheetNames = workbook.SheetNames.filter((n) =>
    /^FLOOR_\d+$/i.test(n)
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

    // Need at least 5 rows: title, instructions, EN-headers, TH-labels, 1 data row
    if (allRows.length < 5) {
      floors.push({ sheetName, rows: [], errors: [] });
      continue;
    }

    // Row 2 (index 2) = English column headers
    const headers = (allRows[2] as (string | null)[]).map((h) =>
      h !== null ? String(h).trim() : null
    );

    // Row 3 = Thai translation labels — skip
    // Rows 4+ = data
    const dataRows = allRows.slice(4);

    const rows: RoomBillingRow[] = [];
    const errors: Array<{ rowIndex: number; roomNo: string; error: string }> = [];

    for (let i = 0; i < dataRows.length; i++) {
      const values = dataRows[i] as unknown[];
      // Skip completely empty rows (room column is null/empty)
      const roomVal = values[headers.indexOf('room')];
      if (!roomVal) continue;

      const rowIndex = i + 4; // 0-based sheet row index
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
 * Convenience: get all successfully-parsed rows from all FLOOR_* sheets.
 */
export function parseAllFloorRows(buffer: Uint8Array): RoomBillingRow[] {
  const result = parseBillingWorkbook(buffer);
  return result.floors.flatMap((f) => f.rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// Full workbook types — CONFIG, ACCOUNTS, RULES, ROOM_MASTER
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkbookConfig {
  schemaVersion: string;
  billingYear: number;
  billingMonth: number;
  currency: string;
}

export interface AccountRow {
  accountId: string;
  accountName: string;
  bankName: string;
  bankAccountNo: string;
  promptpay: string | null;
  active: boolean;
}

export interface RuleRow {
  code: string;
  descriptionTh: string;
  waterEnabled: boolean;
  waterUnitPrice: number;
  waterMinCharge: number;
  waterServiceFeeMode: 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE';
  waterServiceFeeAmount: number;
  electricEnabled: boolean;
  electricUnitPrice: number;
  electricMinCharge: number;
  electricServiceFeeMode: 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE';
  electricServiceFeeAmount: number;
}

export interface RoomMasterRow {
  roomNo: string;
  floorNo: number;
  defaultAccountId: string;
  defaultRuleCode: string;
  defaultRentAmount: number;
  hasFurniture: boolean;
  defaultFurnitureAmount: number;
  roomStatus: 'ACTIVE' | 'INACTIVE';
}

export interface FullWorkbookParseResult extends WorkbookParseResult {
  config: WorkbookConfig;
  accounts: AccountRow[];
  rules: RuleRow[];
  rooms: RoomMasterRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet parsers for CONFIG / ACCOUNTS / RULES / ROOM_MASTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the CONFIG sheet.
 * Row 0 = skipped title, row 1 = headers (key, value, ...), row 2+ = data.
 * We read all rows and build a key→value map.
 */
function parseConfigSheet(
  sheet: XLSX.WorkSheet
): WorkbookConfig {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  // Build key→value from data rows (row index 2 onward, header row is index 1)
  const map: Record<string, string> = {};
  for (let i = 2; i < allRows.length; i++) {
    const row = allRows[i] as (string | number | null)[];
    const key = row[0] !== null ? String(row[0]).trim() : '';
    const val = row[1] !== null ? String(row[1]).trim() : '';
    if (key) map[key] = val;
  }

  const billingYear = parseInt(map['billing_year'] ?? '0', 10);
  const billingMonth = parseInt(map['billing_month'] ?? '0', 10);

  return {
    schemaVersion: map['schema_version'] ?? '',
    billingYear: Number.isFinite(billingYear) ? billingYear : 0,
    billingMonth: Number.isFinite(billingMonth) ? billingMonth : 0,
    currency: map['currency'] ?? 'THB',
  };
}

/**
 * Parse the ACCOUNTS sheet.
 * Row 1 = headers (account_id, account_name, ...), row 2+ = data.
 */
function parseAccountsSheet(sheet: XLSX.WorkSheet): AccountRow[] {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 3) return [];

  const headers = (allRows[1] as (string | null)[]).map((h) =>
    h !== null ? String(h).trim() : null
  );

  const accounts: AccountRow[] = [];
  for (let i = 2; i < allRows.length; i++) {
    const values = allRows[i] as (string | number | null)[];
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (h) row[h] = values[j] ?? null;
    }

    const accountId = toStr(row['account_id']);
    if (!accountId) continue; // skip blank rows

    accounts.push({
      accountId,
      accountName: toStr(row['account_name']) ?? '',
      bankName: toStr(row['bank_name']) ?? '',
      bankAccountNo: toStr(row['bank_account_no']) ?? '',
      promptpay: toStr(row['promptpay']),
      active: String(row['active'] ?? '').trim().toUpperCase() === 'ENABLE',
    });
  }

  return accounts;
}

/**
 * Parse the RULES sheet.
 * Row 1 = headers, row 2+ = data.
 */
function parseRulesSheet(sheet: XLSX.WorkSheet): RuleRow[] {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 3) return [];

  const headers = (allRows[1] as (string | null)[]).map((h) =>
    h !== null ? String(h).trim() : null
  );

  const rules: RuleRow[] = [];
  for (let i = 2; i < allRows.length; i++) {
    const values = allRows[i] as (string | number | null)[];
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (h) row[h] = values[j] ?? null;
    }

    const code = toStr(row['rule_code']);
    if (!code) continue;

    const toServiceFeeMode = (v: unknown): 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE' => {
      const s = String(v ?? '').trim().toUpperCase();
      if (s === 'FLAT_ROOM' || s === 'PER_UNIT' || s === 'MANUAL_FEE') return s;
      return 'NONE';
    };

    rules.push({
      code,
      descriptionTh: toStr(row['description_th']) ?? '',
      waterEnabled: toNum(row['water_enabled']) === 1,
      waterUnitPrice: toNum(row['water_unit_price']),
      waterMinCharge: toNum(row['water_min_charge']),
      waterServiceFeeMode: toServiceFeeMode(row['water_service_fee_mode']),
      waterServiceFeeAmount: toNum(row['water_service_fee_amount']),
      electricEnabled: toNum(row['electric_enabled']) === 1,
      electricUnitPrice: toNum(row['electric_unit_price']),
      electricMinCharge: toNum(row['electric_min_charge']),
      electricServiceFeeMode: toServiceFeeMode(row['electric_service_fee_mode']),
      electricServiceFeeAmount: toNum(row['electric_service_fee_amount']),
    });
  }

  return rules;
}

/**
 * Parse the ROOM_MASTER sheet.
 * Row 1 = headers, row 2+ = data.
 */
function parseRoomMasterSheet(sheet: XLSX.WorkSheet): RoomMasterRow[] {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 3) return [];

  const headers = (allRows[1] as (string | null)[]).map((h) =>
    h !== null ? String(h).trim() : null
  );

  const rooms: RoomMasterRow[] = [];
  for (let i = 2; i < allRows.length; i++) {
    const values = allRows[i] as (string | number | null)[];
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j];
      if (h) row[h] = values[j] ?? null;
    }

    const roomNo = toStr(row['room_no']);
    if (!roomNo) continue;

    const statusRaw = String(row['room_status'] ?? '').trim().toUpperCase();

    rooms.push({
      roomNo,
      floorNo: toNum(row['floor_no']),
      defaultAccountId: toStr(row['default_account_id']) ?? '',
      defaultRuleCode: toStr(row['default_rule_code']) ?? '',
      defaultRentAmount: toNum(row['default_rent_amount']),
      hasFurniture: String(row['has_furniture'] ?? '').trim().toUpperCase() === 'YES',
      defaultFurnitureAmount: toNum(row['default_furniture_amount']),
      roomStatus: statusRaw === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    });
  }

  return rooms;
}

// ─────────────────────────────────────────────────────────────────────────────
// Full workbook parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse all sheets: CONFIG, ACCOUNTS, RULES, ROOM_MASTER, FLOOR_*.
 * Returns both the floor billing rows AND the master data sheets.
 */
export function parseFullWorkbook(buffer: Uint8Array): FullWorkbookParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Parse floor sheets (delegates to existing function logic)
  const base = parseBillingWorkbook(buffer);

  // Parse CONFIG sheet
  const configSheet = workbook.Sheets['CONFIG'];
  const config: WorkbookConfig = configSheet
    ? parseConfigSheet(configSheet)
    : { schemaVersion: '', billingYear: 0, billingMonth: 0, currency: 'THB' };

  // Parse ACCOUNTS sheet
  const accountsSheet = workbook.Sheets['ACCOUNTS'];
  const accounts: AccountRow[] = accountsSheet ? parseAccountsSheet(accountsSheet) : [];

  // Parse RULES sheet
  const rulesSheet = workbook.Sheets['RULES'];
  const rules: RuleRow[] = rulesSheet ? parseRulesSheet(rulesSheet) : [];

  // Parse ROOM_MASTER sheet
  const roomMasterSheet = workbook.Sheets['ROOM_MASTER'];
  const rooms: RoomMasterRow[] = roomMasterSheet ? parseRoomMasterSheet(roomMasterSheet) : [];

  return {
    ...base,
    config,
    accounts,
    rules,
    rooms,
  };
}
