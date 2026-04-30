/**
 * Monthly Data Import Service
 *
 * Handles import of Thai apartment monthly billing Excel files (เดือน1.xlsx - เดือน12.xlsx).
 * These files have a different format from the standard template:
 * - Sheet names: ชั้น 1, ชั้น 2, ..., ชั้น 8
 * - Thai column headers
 * - Month embedded in data, year passed by caller
 */

import { v4 as uuidv4 } from 'uuid';
import type { ImportBatchStatus } from '@prisma/client';
import { BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';

// sql and join are runtime utilities in Prisma 5.x not in all TS declarations.
const sql = (prisma as unknown as Record<string, unknown>).sql as (s: TemplateStringsArray, ...v: unknown[]) => unknown;
const join = (prisma as unknown as Record<string, unknown>).join as (a: unknown[]) => unknown;
import {
  parseMonthlyDataWorkbook,
  parseAllMonthlyDataRows,
  validateMonthlyDataWorkbook,
  type MonthlyDataRow,
} from './monthly-data-parser';
import { getStorage } from '@/infrastructure/storage';
import { DEFAULT_DUE_DAY } from './billing.service';
import { logMeterResetAlert } from '@/modules/audit/audit.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MonthlyDataPreviewGroup = {
  roomNumber: string;
  year: number;
  month: number;
  total: number;
  count: number;
};

export type MonthlyDataWarning = {
  roomNumber: string;
  year: number;
  month: number;
  expectedTotal: number;
  calculatedTotal: number;
  difference: number;
  /** Warning type */
  type: 'total_mismatch' | 'water_mismatch' | 'electric_mismatch' | 'meter_reset';
  /** Detailed message */
  message: string;
};

export type MonthlyDataImportPreviewResult = {
  rows: MonthlyDataRow[];
  preview: MonthlyDataPreviewGroup[];
  warnings: MonthlyDataWarning[];
  batch: {
    id: string;
    status: ImportBatchStatus;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
    billingPeriodId: string;
  };
};

export type MonthlyDataImportBatchListItem = {
  id: string;
  filename: string;
  status: ImportBatchStatus;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsErrored: number;
  createdAt: Date;
  billingPeriod: {
    id: string;
    year: number;
    month: number;
    status: string;
  } | null;
};

export type MonthlyDataImportBatchDetail = MonthlyDataImportBatchListItem & {
  errorLog: unknown;
  rows: MonthlyDataRow[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Billing Calculation Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface BillingRuleForCalc {
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

interface ChargeComparison {
  waterMatches: boolean;
  electricMatches: boolean;
  meterReset: boolean;
  warnings: string[];
  /** Recalculated waterTotal */
  calcWaterTotal: number;
  /** Recalculated electricTotal */
  calcElectricTotal: number;
  /** Recalculated totalDue */
  calcTotalDue: number;
}

/**
 * Calculate water and electric charges based on billing rule.
 * Returns both calculated values and comparison with Excel values.
 */
function calculateChargesFromRule(
  rule: BillingRuleForCalc,
  waterUnits: number,
  electricUnits: number,
  waterPrev: number | null,
  waterCurr: number | null,
  electricPrev: number | null,
  electricCurr: number | null,
  isOccupied: boolean,
  meterResetNote: string | null
): ChargeComparison {
  const warnings: string[] = [];
  let meterReset = false;

  // Calculate water charges
  let calcWaterUsageCharge = 0;
  let calcWaterServiceFee = 0;
  let calcWaterTotal = 0;

  if (rule.waterEnabled && isOccupied) {
    calcWaterUsageCharge = waterUnits * rule.waterUnitPrice;

    // Calculate service fee based on mode
    if (rule.waterServiceFeeMode === 'FLAT_ROOM') {
      calcWaterServiceFee = rule.waterServiceFeeAmount;
    } else if (rule.waterServiceFeeMode === 'PER_UNIT') {
      calcWaterServiceFee = waterUnits * rule.waterServiceFeeAmount;
    }

    calcWaterTotal = calcWaterUsageCharge + calcWaterServiceFee;

    // Apply minimum charge
    if (calcWaterTotal < rule.waterMinCharge) {
      calcWaterTotal = rule.waterMinCharge;
    }
  }

  // Calculate electric charges
  let calcElectricUsageCharge = 0;
  let calcElectricServiceFee = 0;
  let calcElectricTotal = 0;

  if (rule.electricEnabled && isOccupied) {
    calcElectricUsageCharge = electricUnits * rule.electricUnitPrice;

    // Calculate service fee based on mode
    if (rule.electricServiceFeeMode === 'FLAT_ROOM') {
      calcElectricServiceFee = rule.electricServiceFeeAmount;
    } else if (rule.electricServiceFeeMode === 'PER_UNIT') {
      calcElectricServiceFee = electricUnits * rule.electricServiceFeeAmount;
    }

    calcElectricTotal = calcElectricUsageCharge + calcElectricServiceFee;

    // Apply minimum charge
    if (calcElectricTotal < rule.electricMinCharge) {
      calcElectricTotal = rule.electricMinCharge;
    }
  }

  // Calculate total due
  const calcTotalDue = calcWaterTotal + calcElectricTotal;

  // For occupied rooms with meter reset, we can't calculate accurately
  if (meterResetNote) {
    meterReset = true;
    warnings.push(meterResetNote);
  }

  return {
    waterMatches: true, // Will be set after comparison
    electricMatches: true,
    meterReset,
    warnings,
    calcWaterTotal,
    calcElectricTotal,
    calcTotalDue,
  };
}

/**
 * Compare calculated charges with Excel values and return warnings.
 */
function compareWithExcel(
  row: MonthlyDataRow,
  calculated: ChargeComparison
): { warnings: string[]; finalWaterTotal: number; finalElectricTotal: number; finalTotalDue: number } {
  const warnings: string[] = [];

  // Get Excel values (already stored in row from parser)
  const excelWaterTotal = row.waterTotal;
  const excelElectricTotal = row.electricTotal;
  const excelTotalDue = row.totalDue;

  // Use calculated values if they differ from Excel (and meter wasn't reset)
  let finalWaterTotal = calculated.calcWaterTotal;
  let finalElectricTotal = calculated.calcElectricTotal;
  let finalTotalDue = calculated.calcTotalDue;

  // If meter was reset, trust Excel values
  if (calculated.meterReset) {
    finalWaterTotal = excelWaterTotal;
    finalElectricTotal = excelElectricTotal;
    finalTotalDue = excelTotalDue;
  } else {
    // Compare and warn if different
    if (Math.abs(calculated.calcWaterTotal - excelWaterTotal) > 0.01) {
      warnings.push(
        `ค่าน้ำ: Excel=${excelWaterTotal} บาท, คำนวณใหม่=${calculated.calcWaterTotal} บาท (ใช้ค่าจาก Excel)`
      );
      finalWaterTotal = excelWaterTotal;
    }

    if (Math.abs(calculated.calcElectricTotal - excelElectricTotal) > 0.01) {
      warnings.push(
        `ค่าไฟ: Excel=${excelElectricTotal} บาท, คำนวณใหม่=${calculated.calcElectricTotal} บาท (ใช้ค่าจาก Excel)`
      );
      finalElectricTotal = excelElectricTotal;
    }

    // Recalculate total due with corrected values
    finalTotalDue = row.rentAmount + finalWaterTotal + finalElectricTotal + row.furnitureFee + row.otherFee;

    if (Math.abs(finalTotalDue - excelTotalDue) > 0.01) {
      warnings.push(
        `รวมเงิน: Excel=${excelTotalDue} บาท, คำนวณใหม่=${finalTotalDue} บาท`
      );
    }
  }

  return { warnings, finalWaterTotal, finalElectricTotal, finalTotalDue };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview — parse and validate without committing RoomBilling rows
// ─────────────────────────────────────────────────────────────────────────────

export async function createMonthlyDataImportPreviewBatch(input: {
  filename: string;
  fileBuffer: Uint8Array;
  year: number;
  month: number;
  storageKey?: string | null;
  uploadedFileId?: string | null;
  importedBy?: string;
}): Promise<MonthlyDataImportPreviewResult> {
  // Validate workbook format
  const validation = validateMonthlyDataWorkbook(input.fileBuffer);
  if (validation.valid === false) {
    throw new BadRequestError(validation.reason);
  }

  const { year, month } = input;

  if (!year || year < 2000 || year > 2100) {
    throw new BadRequestError(`Invalid year: ${year}`);
  }
  if (!month || month < 1 || month > 12) {
    throw new BadRequestError(`Invalid month: ${month}`);
  }

  // Parse the workbook
  const parsed = parseMonthlyDataWorkbook(input.fileBuffer);
  const allRows = parsed.floors.flatMap((f) => f.rows);
  const allErrors = parsed.floors.flatMap((f) => f.errors);

  if (allRows.length === 0) {
    throw new BadRequestError(
      'No room billing rows found in workbook. Ensure ชั้น_* sheets contain data rows.'
    );
  }

  // Get or create BillingPeriod for this year/month
  let period = await prisma.billingPeriod.findUnique({
    where: { year_month: { year, month } },
  });
  if (!period) {
    period = await prisma.billingPeriod.create({
      data: { year, month, status: 'OPEN', dueDay: DEFAULT_DUE_DAY },
    });
  }

  // Build preview groups (one entry per unique room)
  const roomMap = new Map<string, { count: number; total: number }>();
  for (const row of allRows) {
    const existing = roomMap.get(row.roomNo) ?? { count: 0, total: 0 };
    existing.count++;
    existing.total += Number(row.totalDue);
    roomMap.set(row.roomNo, existing);
  }

  const preview: MonthlyDataPreviewGroup[] = Array.from(roomMap.entries()).map(
    ([roomNumber, g]) => ({
      roomNumber,
      year,
      month,
      total: Math.round(g.total * 100) / 100,
      count: g.count,
    })
  );

  // Compute warnings: rows where declared totalDue ≠ sum of line items, or meter reset
  const warnings: MonthlyDataWarning[] = [];
  for (const row of allRows) {
    const calculated =
      Number(row.rentAmount) +
      Number(row.waterTotal) +
      Number(row.electricTotal) +
      Number(row.furnitureFee) +
      Number(row.otherFee);
    const declared = Number(row.totalDue);
    const diff = Math.abs(declared - calculated);

    if (row.meterResetNote) {
      warnings.push({
        roomNumber: row.roomNo,
        year,
        month,
        expectedTotal: declared,
        calculatedTotal: Math.round(calculated * 100) / 100,
        difference: Math.round((declared - calculated) * 100) / 100,
        type: 'meter_reset',
        message: row.meterResetNote + ' (รวมเงินอาจไม่ถูกต้อง)',
      });
    } else if (diff > 0.02) {
      warnings.push({
        roomNumber: row.roomNo,
        year,
        month,
        expectedTotal: declared,
        calculatedTotal: Math.round(calculated * 100) / 100,
        difference: Math.round((declared - calculated) * 100) / 100,
        type: 'total_mismatch',
        message: `รวมเงิน: Excel=${declared} บาท, คำนวณ=${Math.round(calculated * 100) / 100} บาท`,
      });
    }
  }

  // Create a PENDING ImportBatch
  const batchId = uuidv4();
  await prisma.importBatch.create({
    data: {
      id: batchId,
      billingPeriodId: period.id,
      filename: input.filename,
      schemaVersion: 'monthly-data-v1',
      rowsTotal: allRows.length,
      rowsImported: 0,
      rowsSkipped: 0,
      rowsErrored: allErrors.length,
      status: 'PENDING',
      errorLog: {
        type: 'monthly-data',
        storageKey: input.storageKey ?? null,
        uploadedFileId: input.uploadedFileId ?? null,
        year,
        month,
        parseErrors: allErrors.slice(0, 50),
        warningCount: warnings.length,
      },
      importedBy: input.importedBy ?? 'system',
    },
  });

  return {
    rows: allRows,
    preview,
    warnings,
    batch: {
      id: batchId,
      status: 'PENDING',
      totalRows: allRows.length,
      validRows: allRows.length - allErrors.length,
      invalidRows: allErrors.length,
      warningRows: warnings.length,
      billingPeriodId: period.id,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute — retrieve stored file and import
// ─────────────────────────────────────────────────────────────────────────────

export async function executeMonthlyDataImportBatch(
  batchId: string,
  _importedBy?: string,
  /** Optional file buffer — bypasses storage lookup when provided (for direct-service calls) */
  fileBuffer?: Uint8Array
): Promise<{ batchId: string; cycleId: string; totalImported: number; warnings: MonthlyDataWarning[] }> {
  // 1. Find the PENDING batch
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError('ImportBatch', batchId);
  if (batch.status !== 'PENDING') {
    throw new BadRequestError(
      `Batch ${batchId} is already ${batch.status}. Only PENDING batches can be executed.`
    );
  }

  const errorLogObj = batch.errorLog as Record<string, unknown>;
  const storageKey = errorLogObj['storageKey'] as string | null;
  const year = errorLogObj['year'] as number;
  const month = errorLogObj['month'] as number;

  // 2. Resolve file buffer — either from storage or passed directly
  let buffer: Buffer;
  if (fileBuffer) {
    buffer = Buffer.from(fileBuffer);
  } else if (storageKey) {
    try {
      const storage = getStorage();
      buffer = await storage.downloadFile(storageKey);
    } catch (err) {
      throw new BadRequestError(
        `Unable to retrieve workbook from storage (key: ${storageKey}). ` +
          `Error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  } else {
    throw new BadRequestError(
      'Batch has no associated file in storage. ' +
        'Re-upload the workbook via the Import page to create a new batch.'
    );
  }

  // 3. Mark as PROCESSING
  await prisma.importBatch.update({
    where: { id: batchId },
    data: { status: 'PROCESSING' },
  });

  try {
    // 4. Parse the workbook
    const allRows = parseAllMonthlyDataRows(new Uint8Array(buffer));

    // 5. Get or create BillingPeriod
    let period = await prisma.billingPeriod.findUnique({
      where: { year_month: { year, month } },
    });
    if (!period) {
      period = await prisma.billingPeriod.create({
        data: { year, month, status: 'OPEN', dueDay: DEFAULT_DUE_DAY },
      });
    }

    // 6. Import each row
    let imported = 0;
    const skipped = 0;
    let errors = 0;

    // Get default account and rule for rooms (or skip if not found)
    const defaultAccount = await prisma.bankAccount.findFirst({
      where: { active: true },
    });
    const defaultRule = await prisma.billingRule.findFirst();

    if (!defaultAccount || !defaultRule) {
      throw new BadRequestError(
        'No active bank account or billing rule found. Please set up billing configuration first.'
      );
    }

    // Collection of all warnings for the execute result
    const allWarnings: MonthlyDataWarning[] = [];

    // HIGH-01: prefetch rooms + existing billings in bulk, then batch upsert in a single SQL round-trip.
    // Previously each row caused 3 sequential queries: room lookup, billingRule lookup, upsert.
    const allRoomNos = [...new Set(allRows.map(r => r.roomNo))];
    const [dbRooms, existingBillings] = await Promise.all([
      prisma.room.findMany({ where: { roomNo: { in: allRoomNos } } }),
      prisma.roomBilling.findMany({ where: { billingPeriodId: period.id, roomNo: { in: allRoomNos } } }),
    ]);
    const roomsMap = new Map(dbRooms.map(r => [r.roomNo, r]));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const existingBillingsMap = new Map(existingBillings.map(b => [b.roomNo, b]));
    const ruleMap = new Map<string, typeof defaultRule>();
    const uniqueRuleCodes = [...new Set(allRows.map(r => roomsMap.get(r.roomNo)?.defaultRuleCode ?? defaultRule.code))];
    const rulesFromDb = await prisma.billingRule.findMany({ where: { code: { in: uniqueRuleCodes } } });
    for (const r of rulesFromDb) { ruleMap.set(r.code, r as typeof defaultRule); }

    // Partition rows and compute per-row upsert data
    const validRows: typeof allRows = [];
    for (const row of allRows) {
      if (!roomsMap.has(row.roomNo)) { errors++; continue; }
      validRows.push(row);
    }

    const upsertData: Array<{
      row: typeof allRows[number]; calculated: ReturnType<typeof calculateChargesFromRule>;
      finalWaterTotal: number; finalElectricTotal: number; finalTotalDue: number; rule: typeof defaultRule;
      room: typeof roomsMap extends Map<string, infer V> ? V : never;
    }> = [];
    for (const row of validRows) {
      const room = roomsMap.get(row.roomNo)!;
      const roomRule = ruleMap.get(room.defaultRuleCode) ?? defaultRule;
      const rule = roomRule ?? defaultRule;
      const isOccupied = row.rentAmount > 0;
      const calculated = calculateChargesFromRule(
        {
          waterEnabled: rule.waterEnabled, waterUnitPrice: Number(rule.waterUnitPrice),
          waterMinCharge: Number(rule.waterMinCharge),
          waterServiceFeeMode: rule.waterServiceFeeMode as 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE',
          waterServiceFeeAmount: Number(rule.waterServiceFeeAmount),
          electricEnabled: rule.electricEnabled, electricUnitPrice: Number(rule.electricUnitPrice),
          electricMinCharge: Number(rule.electricMinCharge),
          electricServiceFeeMode: rule.electricServiceFeeMode as 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE',
          electricServiceFeeAmount: Number(rule.electricServiceFeeAmount),
        },
        row.waterUnits, row.electricUnits, row.waterPrev, row.waterCurr, row.electricPrev, row.electricCurr,
        isOccupied, row.meterResetNote
      );
      const { warnings, finalWaterTotal, finalElectricTotal, finalTotalDue } = compareWithExcel(row, calculated);
      if (warnings.length > 0) {
        allWarnings.push({
          roomNumber: row.roomNo, year, month, expectedTotal: row.totalDue, calculatedTotal: finalTotalDue,
          difference: Math.round((finalTotalDue - row.totalDue) * 100) / 100,
          type: warnings.some(w => w.includes('ค่าน้ำ')) ? 'water_mismatch' :
                warnings.some(w => w.includes('ค่าไฟ')) ? 'electric_mismatch' :
                warnings.some(w => w.includes('มิเตอร์')) ? 'meter_reset' : 'total_mismatch',
          message: warnings.join('; '),
        });
      }
      if (row.meterResetNote) {
        const waterReset = row.waterPrev !== null && row.waterCurr !== null && row.waterCurr < row.waterPrev;
        const electricReset = row.electricPrev !== null && row.electricCurr !== null && row.electricCurr < row.electricPrev;
        const meterType = (waterReset && electricReset) ? 'both' : waterReset ? 'water' : 'electric';
        const prevReading = waterReset ? row.waterPrev! : row.electricPrev!;
        const currReading = waterReset ? row.waterCurr! : row.electricPrev!;
        await logMeterResetAlert({ roomNumber: row.roomNo, meterType, previousReading: prevReading, currentReading: currReading, billingPeriod: { year, month }, batchId });
      }
      upsertData.push({ row, calculated, finalWaterTotal, finalElectricTotal, finalTotalDue, rule, room });
    }

    // Single SQL batch upsert — one round-trip regardless of row count
    if (upsertData.length > 0) {
      await prisma.$executeRaw`
        INSERT INTO "room_billings" (
          "id", "billingPeriodId", "roomNo", "status",
          "recvAccountId", "ruleCode",
          "rentAmount",
          "waterMode", "waterPrev", "waterCurr",
          "waterUnits", "waterUsageCharge", "waterServiceFee", "waterTotal",
          "electricMode", "electricPrev", "electricCurr",
          "electricUnits", "electricUsageCharge", "electricServiceFee", "electricTotal",
          "furnitureFee", "otherFee", "totalDue",
          "note"
        ) VALUES ${join(upsertData.map(({ row, calculated, finalWaterTotal, finalElectricTotal, finalTotalDue, rule }) =>
          sql`(
            ${uuidv4()}, ${period.id}, ${row.roomNo}, ${'DRAFT'},
            ${defaultAccount.id}, ${rule.code},
            ${row.rentAmount}::decimal,
            ${'NORMAL'},
            ${row.waterPrev ?? sql`NULL`},
            ${row.waterCurr ?? sql`NULL`},
            ${row.waterUnits}::decimal,
            ${(calculated.calcWaterTotal - row.waterServiceFee)}::decimal,
            ${row.waterServiceFee}::decimal,
            ${finalWaterTotal}::decimal,
            ${'NORMAL'},
            ${row.electricPrev ?? sql`NULL`},
            ${row.electricCurr ?? sql`NULL`},
            ${row.electricUnits}::decimal,
            ${(calculated.calcElectricTotal - row.electricServiceFee)}::decimal,
            ${row.electricServiceFee}::decimal,
            ${finalElectricTotal}::decimal,
            ${row.furnitureFee}::decimal,
            ${row.otherFee}::decimal,
            ${finalTotalDue}::decimal,
            ${row.note ?? sql`NULL`}
          )`
        ))}
        ON CONFLICT ("billingPeriodId", "roomNo")
        DO UPDATE SET
          "rentAmount" = EXCLUDED."rentAmount",
          "ruleCode" = EXCLUDED."ruleCode",
          "waterMode" = EXCLUDED."waterMode",
          "waterPrev" = EXCLUDED."waterPrev",
          "waterCurr" = EXCLUDED."waterCurr",
          "waterUnits" = EXCLUDED."waterUnits",
          "waterUsageCharge" = EXCLUDED."waterUsageCharge",
          "waterServiceFee" = EXCLUDED."waterServiceFee",
          "waterTotal" = EXCLUDED."waterTotal",
          "electricMode" = EXCLUDED."electricMode",
          "electricPrev" = EXCLUDED."electricPrev",
          "electricCurr" = EXCLUDED."electricCurr",
          "electricUnits" = EXCLUDED."electricUnits",
          "electricUsageCharge" = EXCLUDED."electricUsageCharge",
          "electricServiceFee" = EXCLUDED."electricServiceFee",
          "electricTotal" = EXCLUDED."electricTotal",
          "furnitureFee" = EXCLUDED."furnitureFee",
          "otherFee" = EXCLUDED."otherFee",
          "totalDue" = EXCLUDED."totalDue",
          "note" = EXCLUDED."note",
          "updatedAt" = NOW()
      `;
      imported = upsertData.length;

      // Batch room status updates after upsert
      const roomsToVacate = upsertData.filter(({ row, room }) => row.roomStatus === 'INACTIVE' && room.roomStatus !== 'VACANT');
      const roomsToOccupy = upsertData.filter(({ row, room }) => row.roomStatus === 'ACTIVE' && room.roomStatus === 'VACANT');
      if (roomsToVacate.length > 0) {
        await prisma.room.updateMany({
          where: { roomNo: { in: roomsToVacate.map(r => r.row.roomNo) } },
          data: { roomStatus: 'VACANT' },
        });
      }
      if (roomsToOccupy.length > 0) {
        await prisma.room.updateMany({
          where: { roomNo: { in: roomsToOccupy.map(r => r.row.roomNo) } },
          data: { roomStatus: 'OCCUPIED' },
        });
      }
    }

    // 7. Mark as COMPLETED
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'COMPLETED',
        rowsImported: imported,
        rowsSkipped: skipped,
        rowsErrored: errors,
        errorLog: {
          ...errorLogObj,
          billingWarnings: allWarnings,
          warningCount: allWarnings.length,
        },
      },
    });

    return {
      batchId,
      cycleId: period.id,
      totalImported: imported,
      warnings: allWarnings,
    };
  } catch (err) {
    // Roll back to FAILED
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'FAILED',
        errorLog: {
          ...errorLogObj,
          executeError: err instanceof Error ? err.message : String(err),
        },
      },
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List batches
// ─────────────────────────────────────────────────────────────────────────────

export async function listMonthlyDataImportBatches(input?: {
  status?: ImportBatchStatus;
  page?: number;
  pageSize?: number;
}): Promise<{
  batches: MonthlyDataImportBatchListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  // Filter for monthly-data batches only
  const where = input?.status
    ? { status: input.status, schemaVersion: 'monthly-data-v1' }
    : { schemaVersion: 'monthly-data-v1' };

  const [batches, total] = await Promise.all([
    prisma.importBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { billingPeriod: true },
    }),
    prisma.importBatch.count({ where }),
  ]);

  return {
    batches: batches.map((b) => ({
      id: b.id,
      filename: b.filename,
      status: b.status,
      rowsTotal: b.rowsTotal,
      rowsImported: b.rowsImported,
      rowsSkipped: b.rowsSkipped,
      rowsErrored: b.rowsErrored,
      createdAt: b.createdAt,
      billingPeriod: b.billingPeriod
        ? {
            id: b.billingPeriod.id,
            year: b.billingPeriod.year,
            month: b.billingPeriod.month,
            status: b.billingPeriod.status,
          }
        : null,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch detail
// ─────────────────────────────────────────────────────────────────────────────

export async function getMonthlyDataImportBatchDetail(
  batchId: string
): Promise<MonthlyDataImportBatchDetail> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { billingPeriod: true },
  });
  if (!batch) throw new NotFoundError('ImportBatch', batchId);

  const errorLogObj = batch.errorLog as Record<string, unknown>;

  // Attempt to retrieve rows from storage for PENDING batches
  let rows: MonthlyDataRow[] = [];
  if (batch.status === 'PENDING') {
    const storageKey = errorLogObj['storageKey'] as string | null;
    if (storageKey) {
      try {
        const storage = getStorage();
        const buffer = await storage.downloadFile(storageKey);
        rows = parseAllMonthlyDataRows(new Uint8Array(buffer));
      } catch {
        // Storage file unavailable
      }
    }
  }

  return {
    id: batch.id,
    filename: batch.filename,
    status: batch.status,
    rowsTotal: batch.rowsTotal,
    rowsImported: batch.rowsImported,
    rowsSkipped: batch.rowsSkipped,
    rowsErrored: batch.rowsErrored,
    createdAt: batch.createdAt,
    billingPeriod: batch.billingPeriod
      ? {
          id: batch.billingPeriod.id,
          year: batch.billingPeriod.year,
          month: batch.billingPeriod.month,
          status: batch.billingPeriod.status,
        }
      : null,
    errorLog: batch.errorLog,
    rows,
    totalRows: batch.rowsTotal,
    validRows: batch.rowsTotal - batch.rowsErrored,
    invalidRows: batch.rowsErrored,
    warningRows: 0,
  };
}
