/**
 * Monthly Data Excel Import Parser
 *
 * รองรับ 2 format:
 *
 * ── Format ใหม่ (billing_template.xlsx) ──────────────────────────
 *   Sheet names: ชั้น_1, ชั้น_2, ..., ชั้น_8  (underscore)
 *   row 0  — Title (e.g. "ข้อมูลบิล ชั้น 1")  ← ข้าม
 *   row 1  — English column headers (room, rent_amount, water_prev, ...)
 *   row 2  — Thai label descriptions           ← ข้าม
 *   row 3+ — actual room-billing data
 *
 * ── Format เดิม ───────────────────────────────────────────────────
 *   Sheet names: ชั้น 1, ชั้น 2, ..., ชั้น 8  (space)
 *   row 0  — Thai column headers (ห้อง, ค่าเช่า, น้ำก่อน, ...)
 *   row 1+ — actual room-billing data
 *
 * Format ถูก detect อัตโนมัติ — รองรับทั้งคู่พร้อมกัน
 */

import * as XLSX from 'xlsx';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Output row schema — matches RoomBilling DB model structure
// ─────────────────────────────────────────────────────────────────────────────

export const monthlyDataRowSchema = z.object({
  /** Excel room column, e.g. "798/1", "3201" */
  roomNo: z.string().min(1),

  /** Which ชั้น_x sheet this row came from */
  floorSheetName: z.string(),

  rentAmount: z.number(),

  // Water meter
  waterPrev: z.number().nullable(),
  waterCurr: z.number().nullable(),
  waterUnits: z.number().default(0),
  waterServiceFee: z.number().default(0),
  waterTotal: z.number().default(0),

  // Electric meter
  electricPrev: z.number().nullable(),
  electricCurr: z.number().nullable(),
  electricUnits: z.number().default(0),
  electricServiceFee: z.number().default(0),
  electricTotal: z.number().default(0),

  furnitureFee: z.number().default(0),
  otherFee: z.number().default(0),
  /** Declared total from Excel — for cross-check / warnings */
  totalDue: z.number().default(0),

  note: z.string().nullable(),
  /** Room status derived from rent amount */
  roomStatus: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  /** Note if meter was reset (cannot calculate usage) */
  meterResetNote: z.string().nullable().default(null),
});

export type MonthlyDataRow = z.infer<typeof monthlyDataRowSchema>;

export interface MonthlyFloorParseResult {
  sheetName: string;
  rows: MonthlyDataRow[];
  errors: Array<{ rowIndex: number; roomNo: string; error: string }>;
}

export interface MonthlyDataParseResult {
  floors: MonthlyFloorParseResult[];
  totalRows: number;
  totalErrors: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function findColumnIndex(headers: (string | null)[], name: string): number {
  const lower = name.toLowerCase();
  return headers.findIndex((h) => h?.toLowerCase().trim() === lower);
}

function getByHeader(headers: (string | null)[], values: unknown[], name: string): unknown {
  const idx = findColumnIndex(headers, name);
  return idx >= 0 ? values[idx] ?? null : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format detection
// ─────────────────────────────────────────────────────────────────────────────

/** English column names ที่ใช้ใน format ใหม่ (billing_template.xlsx) */
const NEW_FORMAT_MARKERS = ['room', 'rent_amount', 'water_prev', 'water_curr', 'electric_prev'];

/**
 * ตรวจว่าเป็น format ใหม่ (billing_template.xlsx) หรือไม่
 * เช็คว่า row 1 (index 1) มี English column names
 */
function detectNewFormat(allRows: unknown[][]): boolean {
  if (allRows.length < 2) return false;
  const row1 = (allRows[1] as (string | null)[]).map((h) =>
    h !== null ? String(h).toLowerCase().trim() : null
  );
  return NEW_FORMAT_MARKERS.some((marker) => row1.includes(marker));
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor sheet parser — new format (billing_template.xlsx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse floor sheet ใน format ใหม่:
 *   row 0 = Title → ข้าม
 *   row 1 = English headers
 *   row 2 = Thai labels → ข้าม
 *   row 3+ = data
 */
function parseFloorSheetNewFormat(
  sheet: XLSX.WorkSheet,
  sheetName: string
): MonthlyFloorParseResult {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 4) {
    return { sheetName, rows: [], errors: [] };
  }

  // row 1 = English headers
  const headers = (allRows[1] as (string | null)[]).map((h) =>
    h !== null ? String(h).trim() : null
  );

  const rows: MonthlyDataRow[] = [];
  const errors: Array<{ rowIndex: number; roomNo: string; error: string }> = [];

  // data starts at row 3 (index 3) — skip row 2 (Thai labels)
  for (let i = 3; i < allRows.length; i++) {
    const values = allRows[i] as any[];

    // Get room number from "room" column
    const roomVal = getByHeader(headers, values, 'room');
    if (!roomVal) continue;

    const roomNo = String(roomVal).trim();

    // Skip summary rows
    if (roomNo.toLowerCase().startsWith('summary')) continue;

    const rowIndex = i;

    try {
      const rentAmount = toNum(getByHeader(headers, values, 'rent_amount'));

      const waterPrev = toNumOrNull(getByHeader(headers, values, 'water_prev'));
      const waterCurr = toNumOrNull(getByHeader(headers, values, 'water_curr'));
      const electricPrev = toNumOrNull(getByHeader(headers, values, 'electric_prev'));
      const electricCurr = toNumOrNull(getByHeader(headers, values, 'electric_curr'));

      // Use manual units override if provided, else calculate from readings
      const waterUnitsManual = toNumOrNull(getByHeader(headers, values, 'water_units_manual'));
      const electricUnitsManual = toNumOrNull(
        getByHeader(headers, values, 'electric_units_manual')
      );

      const calculatedWaterUnits =
        waterCurr !== null && waterPrev !== null ? waterCurr - waterPrev : 0;
      const calculatedElectricUnits =
        electricCurr !== null && electricPrev !== null ? electricCurr - electricPrev : 0;

      // Detect meter reset (curr < prev)
      const waterMeterReset =
        waterCurr !== null && waterPrev !== null && waterCurr < waterPrev;
      const electricMeterReset =
        electricCurr !== null && electricPrev !== null && electricCurr < electricPrev;

      // Manual override takes priority, then calculated, fallback to 0 on reset
      const finalWaterUnits =
        waterUnitsManual !== null
          ? waterUnitsManual
          : waterMeterReset
          ? 0
          : calculatedWaterUnits;

      const finalElectricUnits =
        electricUnitsManual !== null
          ? electricUnitsManual
          : electricMeterReset
          ? 0
          : calculatedElectricUnits;

      // Build meter reset note
      let meterResetNote: string | null = null;
      if (waterMeterReset || electricMeterReset) {
        const parts: string[] = [];
        if (waterMeterReset) parts.push('น้ำ');
        if (electricMeterReset) parts.push('ไฟ');
        meterResetNote = 'มิเตอร์' + parts.join('/') + 'ถูกเปลี่ยน คำนวณไม่ได้';
      }

      // Charges from Excel (water_charge, electric_charge)
      const waterTotal = toNum(getByHeader(headers, values, 'water_charge'));
      const electricTotal = toNum(getByHeader(headers, values, 'electric_charge'));

      // Service fees — use manual override if provided
      const waterFeeManual = toNumOrNull(getByHeader(headers, values, 'water_fee_manual'));
      const electricFeeManual = toNumOrNull(
        getByHeader(headers, values, 'electric_fee_manual')
      );
      const waterServiceFee =
        waterFeeManual !== null
          ? waterFeeManual
          : toNum(getByHeader(headers, values, 'water_fee'));
      const electricServiceFee =
        electricFeeManual !== null
          ? electricFeeManual
          : toNum(getByHeader(headers, values, 'electric_fee'));

      const furnitureFee = toNum(getByHeader(headers, values, 'furniture_fee'));
      const otherFee = toNum(getByHeader(headers, values, 'other_fee'));
      const totalDue = toNum(getByHeader(headers, values, 'total_due'));

      const rawNote = toStr(getByHeader(headers, values, 'note'));
      const note = meterResetNote || rawNote;

      const roomStatus = rentAmount > 0 ? 'ACTIVE' : 'INACTIVE';

      rows.push(
        monthlyDataRowSchema.parse({
          roomNo,
          floorSheetName: sheetName,
          rentAmount,
          waterPrev,
          waterCurr,
          waterUnits: finalWaterUnits,
          waterServiceFee,
          waterTotal,
          electricPrev,
          electricCurr,
          electricUnits: finalElectricUnits,
          electricServiceFee,
          electricTotal,
          furnitureFee,
          otherFee,
          totalDue,
          note,
          roomStatus,
          meterResetNote,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ rowIndex, roomNo, error: msg });
    }
  }

  return { sheetName, rows, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Floor sheet parser — old format (เดือนX.xlsx)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse floor sheet ใน format เดิม:
 *   row 0 = Thai headers
 *   row 1+ = data
 */
function parseFloorSheetOldFormat(
  sheet: XLSX.WorkSheet,
  sheetName: string
): MonthlyFloorParseResult {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (allRows.length < 2) {
    return { sheetName, rows: [], errors: [] };
  }

  // Row 0 = Thai headers
  const headers = (allRows[0] as (string | null)[]).map((h) =>
    h !== null ? String(h).trim() : null
  );

  const rows: MonthlyDataRow[] = [];
  const errors: Array<{ rowIndex: number; roomNo: string; error: string }> = [];

  // Find room column — may be "ห้อง" or "เลขห้อง"
  const roomHeader = findColumnIndex(headers, 'ห้อง') >= 0 ? 'ห้อง' : 'เลขห้อง';

  for (let i = 1; i < allRows.length; i++) {
    const values = allRows[i] as any[];
    const roomVal = getByHeader(headers, values, roomHeader);

    if (!roomVal) continue;

    const roomNo = String(roomVal).trim();
    const rowIndex = i;

    try {
      const rentAmount = toNum(getByHeader(headers, values, 'ค่าเช่า'));

      const waterPrev = toNumOrNull(getByHeader(headers, values, 'น้ำก่อน'));
      const waterCurr = toNumOrNull(getByHeader(headers, values, 'น้ำหลัง'));
      const electricPrev = toNumOrNull(getByHeader(headers, values, 'ไฟก่อน'));
      const electricCurr = toNumOrNull(getByHeader(headers, values, 'ไฟหลัง'));

      const excelWaterTotal = toNum(getByHeader(headers, values, 'ค่าน้ำ'));
      const excelElectricTotal = toNum(getByHeader(headers, values, 'ค่าไฟ'));

      const calculatedWaterUnits = (waterCurr ?? 0) - (waterPrev ?? 0);
      const calculatedElectricUnits = (electricCurr ?? 0) - (electricPrev ?? 0);

      const waterMeterReset =
        waterCurr !== null && waterPrev !== null && waterCurr < waterPrev;
      const electricMeterReset =
        electricCurr !== null && electricPrev !== null && electricCurr < electricPrev;

      const finalWaterUnits = waterMeterReset ? 0 : calculatedWaterUnits;
      const finalElectricUnits = electricMeterReset ? 0 : calculatedElectricUnits;

      let meterResetNote: string | null = null;
      if (waterMeterReset || electricMeterReset) {
        const parts: string[] = [];
        if (waterMeterReset) parts.push('น้ำ');
        if (electricMeterReset) parts.push('ไฟ');
        meterResetNote = 'มิเตอร์' + parts.join('/') + 'ถูกเปลี่ยน คำนวณไม่ได้';
      }

      const furnitureFee = toNum(getByHeader(headers, values, 'เฟอร์'));
      const otherFee = toNum(getByHeader(headers, values, 'อื่นๆ'));

      const calculatedTotalDue =
        rentAmount + excelWaterTotal + excelElectricTotal + furnitureFee + otherFee;

      const rawNote = toStr(getByHeader(headers, values, 'หมายเหตุ'));
      const note = meterResetNote || rawNote;

      const roomStatus = rentAmount > 0 ? 'ACTIVE' : 'INACTIVE';

      rows.push(
        monthlyDataRowSchema.parse({
          roomNo,
          floorSheetName: sheetName,
          rentAmount,
          waterPrev,
          waterCurr,
          waterUnits: finalWaterUnits,
          waterServiceFee: 0,
          waterTotal: excelWaterTotal,
          electricPrev,
          electricCurr,
          electricUnits: finalElectricUnits,
          electricServiceFee: 0,
          electricTotal: excelElectricTotal,
          furnitureFee,
          otherFee,
          totalDue: calculatedTotalDue,
          note,
          roomStatus,
          meterResetNote,
        })
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ rowIndex, roomNo, error: msg });
    }
  }

  return { sheetName, rows, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified floor sheet parser — auto-detect format
// ─────────────────────────────────────────────────────────────────────────────

function parseFloorSheet(sheet: XLSX.WorkSheet, sheetName: string): MonthlyFloorParseResult {
  const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  });

  if (detectNewFormat(allRows as any[][])) {
    return parseFloorSheetNewFormat(sheet, sheetName);
  }
  return parseFloorSheetOldFormat(sheet, sheetName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a monthly data workbook (billing_template.xlsx หรือ เดือนX.xlsx)
 * Sheet names: ชั้น_1 … ชั้น_8  หรือ  ชั้น 1 … ชั้น 8
 */
export function parseMonthlyDataWorkbook(buffer: Uint8Array): MonthlyDataParseResult {
  const workbook = XLSX.read(buffer, { type: 'array' });

  // รองรับทั้ง "ชั้น_1" (underscore) และ "ชั้น 1" (space)
  const floorSheetNames = workbook.SheetNames.filter((n) => /^ชั้น[\s_]*\d+$/i.test(n));

  const floors: MonthlyFloorParseResult[] = [];
  let totalRows = 0;
  let totalErrors = 0;

  for (const sheetName of floorSheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const result = parseFloorSheet(sheet, sheetName);
    floors.push(result);
    totalRows += result.rows.length;
    totalErrors += result.errors.length;
  }

  return { floors, totalRows, totalErrors };
}

/**
 * Convenience: get all successfully-parsed rows from all ชั้น_* sheets.
 */
export function parseAllMonthlyDataRows(buffer: Uint8Array): MonthlyDataRow[] {
  const result = parseMonthlyDataWorkbook(buffer);
  return result.floors.flatMap((f) => f.rows);
}

/**
 * Validate that the workbook looks like a monthly data file (has ชั้น sheets).
 */
export function validateMonthlyDataWorkbook(
  buffer: Uint8Array
): { valid: true } | { valid: false; reason: string } {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const floorSheets = workbook.SheetNames.filter((n) => /^ชั้น[\s_]*\d+$/i.test(n));

    if (floorSheets.length === 0) {
      return {
        valid: false,
        reason: 'No ชั้น sheets found. This does not appear to be a monthly data file.',
      };
    }

    for (const sheetName of floorSheets) {
      const sheet = workbook.Sheets[sheetName];
      const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: null,
      });
      if (allRows.length < 2) {
        return {
          valid: false,
          reason: `Sheet "${sheetName}" has no data rows.`,
        };
      }
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : 'Failed to parse workbook',
    };
  }
}
