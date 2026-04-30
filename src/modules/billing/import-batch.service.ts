/**
 * Billing Import Batch Service
 *
 * Two-step workflow:
 *   1. createBillingImportPreviewBatch  — parse workbook, create PENDING batch, return preview
 *   2. executeBillingImportBatch        — retrieve stored file, call importFullWorkbook
 *
 * The file is persisted to storage by the HTTP route before calling
 * createBillingImportPreviewBatch. The storageKey is stored in the
 * ImportBatch.errorLog so execute can retrieve it without requiring the client
 * to re-upload the file.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ImportBatchStatus, MeterMode, Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { parseFullWorkbook } from './import-parser';
import { createBillingService, DEFAULT_DUE_DAY } from './billing.service';
import { getStorage } from '@/infrastructure/storage';

// sql and join are runtime utilities in Prisma 5.x not in all TS declarations.
const sql = (prisma as unknown as Record<string, unknown>).sql as (s: TemplateStringsArray, ...v: unknown[]) => unknown;
const join = (prisma as unknown as Record<string, unknown>).join as (a: unknown[]) => unknown;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PreviewGroup = {
  roomNumber: string;
  year: number;
  month: number;
  total: number;
  count: number;
};

export type PreviewWarning = {
  roomNumber: string;
  year: number;
  month: number;
  expectedTotal: number;
  calculatedTotal: number;
  difference: number;
};

export type BillingImportPreviewResult = {
  rows: unknown[];
  preview: PreviewGroup[];
  warnings: PreviewWarning[];
  batch: {
    id: string;
    status: ImportBatchStatus;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
    /** billingCycleId kept for UI compatibility — maps to BillingPeriod.id */
    billingCycleId: string;
  };
};

export type BillingImportBatchListItem = {
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

export type BillingImportBatchDetail = BillingImportBatchListItem & {
  errorLog: unknown;
  rows: unknown[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Preview — parse and validate without committing RoomBilling rows
// ─────────────────────────────────────────────────────────────────────────────

export async function createBillingImportPreviewBatch(input: {
  filename: string;
  fileBuffer: Uint8Array;
  uploadedFileId?: string | null;
  storageKey?: string | null;
  importedBy?: string;
}): Promise<BillingImportPreviewResult> {
  // Parse the workbook — throws on format errors
  const parsed = parseFullWorkbook(input.fileBuffer);
  const { config, accounts, rules } = parsed;

  const year = config.billingYear;
  const month = config.billingMonth;

  if (!year || !month || year < 2000 || month < 1 || month > 12) {
    throw new BadRequestError(
      `Workbook CONFIG sheet has invalid billing_year (${year}) or billing_month (${month}). ` +
        'Verify the CONFIG sheet values and try again.',
    );
  }

  const allRows = parsed.floors.flatMap((f) => f.rows);
  const allErrors = parsed.floors.flatMap((f) => f.errors);

  if (allRows.length === 0) {
    throw new BadRequestError(
      'No room billing rows found in workbook. ' +
        'Ensure FLOOR_* sheets contain data rows (starting from row 4).',
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

  const preview: PreviewGroup[] = Array.from(roomMap.entries()).map(([roomNumber, g]) => ({
    roomNumber,
    year,
    month,
    total: Math.round(g.total * 100) / 100,
    count: g.count,
  }));

  // Compute warnings: rows where declared totalDue ≠ sum of line items
  const warnings: PreviewWarning[] = [];
  for (const row of allRows) {
    const calculated =
      Number(row.rentAmount) +
      Number(row.waterTotal) +
      Number(row.electricTotal) +
      Number(row.furnitureFee) +
      Number(row.otherFee);
    const declared = Number(row.totalDue);
    const diff = Math.abs(declared - calculated);
    if (diff > 0.02) {
      warnings.push({
        roomNumber: row.roomNo,
        year,
        month,
        expectedTotal: declared,
        calculatedTotal: Math.round(calculated * 100) / 100,
        difference: Math.round((declared - calculated) * 100) / 100,
      });
    }
  }

  // Create a PENDING ImportBatch with the storageKey so execute can retrieve it
  const batchId = uuidv4();
  await prisma.importBatch.create({
    data: {
      id: batchId,
      billingPeriodId: period.id,
      filename: input.filename,
      schemaVersion: 'billing-v2',
      rowsTotal: allRows.length,
      rowsImported: 0,
      rowsSkipped: 0,
      rowsErrored: allErrors.length,
      status: 'PENDING',
      errorLog: {
        storageKey: input.storageKey ?? null,
        uploadedFileId: input.uploadedFileId ?? null,
        parseErrors: allErrors.slice(0, 50),
        warningCount: warnings.length,
        accounts: accounts as unknown as Prisma.InputJsonValue,
        rules: rules as unknown as Prisma.InputJsonValue,
        rows: allRows as unknown as Prisma.InputJsonValue,
      },
      importedBy: input.importedBy ?? 'system',
    },
  });

  return {
    rows: allRows as unknown[],
    preview,
    warnings,
    batch: {
      id: batchId,
      status: 'PENDING',
      totalRows: allRows.length,
      validRows: allRows.length - allErrors.length,
      invalidRows: allErrors.length,
      warningRows: warnings.length,
      billingCycleId: period.id,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebuild — re-parse the already-stored file into a refreshed preview
// ─────────────────────────────────────────────────────────────────────────────

export async function rebuildBillingImportBatchFromWorkbook(input: {
  batchId: string;
  filename: string;
  fileBuffer: Uint8Array;
  uploadedFileId?: string | null;
}): Promise<BillingImportPreviewResult> {
  const existing = await prisma.importBatch.findUnique({ where: { id: input.batchId } });
  if (!existing) throw new NotFoundError('ImportBatch', input.batchId);
  if (existing.status !== 'PENDING') {
    throw new BadRequestError(
      `Batch ${input.batchId} is ${existing.status} — only PENDING batches can be refreshed.`,
    );
  }

  const errorLogObj = (existing.errorLog ?? {}) as Record<string, unknown>;

  return createBillingImportPreviewBatch({
    filename: input.filename,
    fileBuffer: input.fileBuffer,
    uploadedFileId: input.uploadedFileId,
    storageKey: (errorLogObj['storageKey'] as string | null) ?? null,
    importedBy: existing.importedBy,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute — retrieve stored file and run importFullWorkbook
// ─────────────────────────────────────────────────────────────────────────────

export async function executeBillingImportBatch(
  batchId: string,
  importedBy?: string,
): Promise<{ batchId: string; cycleId: string; totalImported: number }> {
  // 1. Find the PENDING batch
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError('ImportBatch', batchId);
  if (batch.status !== 'PENDING') {
    throw new BadRequestError(
      `Batch ${batchId} is already ${batch.status}. Only PENDING batches can be executed.`,
    );
  }

  const errorLogObj = (batch.errorLog ?? {}) as Record<string, unknown>;
  const storageKey = errorLogObj['storageKey'] as string | null;

  if (!storageKey) {
    throw new BadRequestError(
      'Batch has no associated file in storage. ' +
        'Re-upload the workbook via the Import page to create a new batch.',
    );
  }

  // Check if we have stored rows from inline editing
  const storedRows = errorLogObj['rows'];
  const hasStoredRows = Array.isArray(storedRows) && storedRows.length > 0;

  // 2. Download file buffer from storage (needed for config if not using stored rows)
  let buffer: Buffer;
  try {
    const storage = getStorage();
    buffer = await storage.downloadFile(storageKey);
  } catch (err) {
    throw new BadRequestError(
      `Unable to retrieve workbook from storage (key: ${storageKey}). ` +
        `Error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 3. Mark as PROCESSING
  await prisma.importBatch.update({
    where: { id: batchId },
    data: { status: 'PROCESSING' },
  });

  try {
    let result: {
      batchId: string;
      billingPeriodId: string;
      imported: number;
      skipped: number;
      errors: number;
    };

    if (hasStoredRows) {
      // Use stored accounts/rules from errorLog if available, otherwise parse from buffer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accounts = (errorLogObj['accounts'] as any as Array<Record<string, unknown>>) ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rules = (errorLogObj['rules'] as any as Array<Record<string, unknown>>) ?? [];

      // Get billingPeriod from stored rows (use first row's metadata) or parse from config
      const rows = storedRows as Array<Record<string, unknown>>;
      const firstRow = rows[0] as Record<string, unknown>;
      let year: number;
      let month: number;

      if (accounts.length > 0 && rules.length > 0) {
        // Use year/month stored from first row during preview
        year = (firstRow['billingYear'] as number) ?? (new Date()).getFullYear();
        month = (firstRow['billingMonth'] as number) ?? (new Date()).getMonth() + 1;
      } else {
        // Fall back: parse from buffer
        const parsed = parseFullWorkbook(new Uint8Array(buffer));
        const config = parsed.config;
        year = (firstRow['billingYear'] as number) ?? config.billingYear;
        month = (firstRow['billingMonth'] as number) ?? config.billingMonth;
      }

      // Get or create BillingPeriod
      let period = await prisma.billingPeriod.findUnique({
        where: { year_month: { year, month } },
      });
      if (!period) {
        period = await prisma.billingPeriod.create({
          data: { id: uuidv4(), year, month, status: 'OPEN', dueDay: DEFAULT_DUE_DAY },
        });
      }
      const billingPeriodId = period.id;

      // Upsert bank accounts
      for (const acc of accounts) {
        await prisma.bankAccount.upsert({
          where: { id: acc['id'] as string },
          create: {
            id: acc['id'] as string,
            name: acc['accountName'] as string,
            bankName: acc['bank'] as string,
            bankAccountNo: acc['accountNumber'] as string,
            active: Boolean(acc['isDefault']),
          },
          update: {
            name: acc['accountName'] as string,
            bankName: acc['bank'] as string,
            bankAccountNo: acc['accountNumber'] as string,
            active: Boolean(acc['isDefault']),
          },
        });
      }

      // Build effective rules map from stored rules (code -> rule data)
      const rulesMap = new Map<string, Record<string, unknown>>();
      for (const r of rules) {
        const code = (r['code'] as string) ?? 'DEFAULT';
        rulesMap.set(code, r);
      }

      const allRoomNos = Array.from(new Set(rows.map((r) => r['roomNo'] as string)));
      const [dbRooms, existingBillings] = await Promise.all([
        prisma.room.findMany({ where: { roomNo: { in: allRoomNos } } }),
        prisma.roomBilling.findMany({
          where: { billingPeriodId, roomNo: { in: allRoomNos } },
        }),
      ]);
      const roomsMap = new Map(dbRooms.map((r) => [r.roomNo, r]));
      const billingsMap = new Map(existingBillings.map((b) => [b.roomNo, b]));

      let imported = 0;
      let skipped = 0;
      const errors = 0;

      // HIGH-01 fix: replaced sequential per-row upserts with two batch operations.
      // Prefetch was already done above (roomsMap, billingsMap); now partition and batch.
      const validRows = rows.filter(row => {
        const roomNo = row['roomNo'] as string;
        const dbRoom = roomsMap.get(roomNo);
        if (!dbRoom) { skipped++; return false; }
        const existingBilling = billingsMap.get(roomNo);
        if (existingBilling && existingBilling.status !== 'DRAFT') { skipped++; return false; }
        return true;
      });

      if (validRows.length > 0) {
        // Batch upsert via raw SQL — single DB round-trip for all rows.
        await prisma.$executeRaw`
          INSERT INTO "room_billings" (
            "id", "billingPeriodId", "roomNo", "status",
            "recvAccountOverrideId", "recvAccountId", "ruleOverrideCode", "ruleCode",
            "rentAmount",
            "waterMode", "waterPrev", "waterCurr", "waterUnitsManual",
            "waterUnits", "waterUsageCharge", "waterServiceFeeManual", "waterServiceFee", "waterTotal",
            "electricMode", "electricPrev", "electricCurr", "electricUnitsManual",
            "electricUnits", "electricUsageCharge", "electricServiceFeeManual", "electricServiceFee", "electricTotal",
            "furnitureFee", "otherFee", "totalDue",
            "note", "checkNotes"
          ) VALUES ${join(validRows.map(row => {
            const ruleCode = (row['ruleCode'] as string) ?? 'DEFAULT';
            return sql`
              (
                ${uuidv4()}, ${billingPeriodId}, ${row['roomNo'] as string}, ${'DRAFT'},
                ${(row['recvAccountOverrideId'] as string) ?? sql`NULL`},
                ${(row['recvAccountId'] as string) ?? sql`NULL`},
                ${(row['ruleOverrideCode'] as string) ?? sql`NULL`},
                ${ruleCode},
                ${Number(row['rentAmount']) || 0}::decimal,
                ${((row['waterMode'] as MeterMode | null) ?? 'NORMAL')}, ${row['waterPrev'] as number ?? sql`NULL`},
                ${row['waterCurr'] as number ?? sql`NULL`},
                ${row['waterUnitsManual'] as number ?? sql`NULL`},
                ${Number(row['waterUnits']) || 0}::decimal, ${Number(row['waterUsageCharge']) || 0}::decimal,
                ${row['waterServiceFeeManual'] as number ?? sql`NULL`},
                ${Number(row['waterServiceFee']) || 0}::decimal, ${Number(row['waterTotal']) || 0}::decimal,
                ${((row['electricMode'] as MeterMode | null) ?? 'NORMAL')}, ${row['electricPrev'] as number ?? sql`NULL`},
                ${row['electricCurr'] as number ?? sql`NULL`},
                ${row['electricUnitsManual'] as number ?? sql`NULL`},
                ${Number(row['electricUnits']) || 0}::decimal, ${Number(row['electricUsageCharge']) || 0}::decimal,
                ${row['electricServiceFeeManual'] as number ?? sql`NULL`},
                ${Number(row['electricServiceFee']) || 0}::decimal, ${Number(row['electricTotal']) || 0}::decimal,
                ${Number(row['furnitureFee']) || 0}::decimal, ${Number(row['otherFee']) || 0}::decimal,
                ${Number(row['totalDue']) || 0}::decimal,
                ${(row['note'] as string) ?? sql`NULL`},
                ${(row['checkNotes'] as string) ?? sql`NULL`}
              )
            `;
          }))}
          ON CONFLICT ("billingPeriodId", "roomNo")
          DO UPDATE SET
            "recvAccountOverrideId" = EXCLUDED."recvAccountOverrideId",
            "recvAccountId" = EXCLUDED."recvAccountId",
            "ruleOverrideCode" = EXCLUDED."ruleOverrideCode",
            "ruleCode" = EXCLUDED."ruleCode",
            "rentAmount" = EXCLUDED."rentAmount",
            "waterMode" = EXCLUDED."waterMode",
            "waterPrev" = EXCLUDED."waterPrev",
            "waterCurr" = EXCLUDED."waterCurr",
            "waterUnitsManual" = EXCLUDED."waterUnitsManual",
            "waterUnits" = EXCLUDED."waterUnits",
            "waterUsageCharge" = EXCLUDED."waterUsageCharge",
            "waterServiceFeeManual" = EXCLUDED."waterServiceFeeManual",
            "waterServiceFee" = EXCLUDED."waterServiceFee",
            "waterTotal" = EXCLUDED."waterTotal",
            "electricMode" = EXCLUDED."electricMode",
            "electricPrev" = EXCLUDED."electricPrev",
            "electricCurr" = EXCLUDED."electricCurr",
            "electricUnitsManual" = EXCLUDED."electricUnitsManual",
            "electricUnits" = EXCLUDED."electricUnits",
            "electricUsageCharge" = EXCLUDED."electricUsageCharge",
            "electricServiceFeeManual" = EXCLUDED."electricServiceFeeManual",
            "electricServiceFee" = EXCLUDED."electricServiceFee",
            "electricTotal" = EXCLUDED."electricTotal",
            "furnitureFee" = EXCLUDED."furnitureFee",
            "otherFee" = EXCLUDED."otherFee",
            "totalDue" = EXCLUDED."totalDue",
            "note" = EXCLUDED."note",
            "checkNotes" = EXCLUDED."checkNotes",
            "updatedAt" = NOW()
        `;
        imported += validRows.length;
      }

      result = {
        batchId,
        billingPeriodId,
        imported,
        skipped,
        errors,
      };

      // 4. Mark as COMPLETED
      await prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'COMPLETED',
          rowsImported: result.imported,
          rowsSkipped: result.skipped,
          rowsErrored: result.errors,
        },
      });

      return {
        batchId,
        cycleId: result.billingPeriodId,
        totalImported: result.imported,
      };
    } else {
      // No stored rows — use existing importFullWorkbook flow (re-parse Excel)
      const billingService = createBillingService();
      result = await billingService.importFullWorkbook(
        new Uint8Array(buffer),
        importedBy ?? batch.importedBy,
      );

      // 5. Mark as COMPLETED
      await prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'COMPLETED',
          rowsImported: result.imported,
          rowsSkipped: result.skipped,
          rowsErrored: result.errors,
        },
      });

      return {
        batchId,
        cycleId: result.billingPeriodId,
        totalImported: result.imported,
      };
    }
  } catch (err) {
    // Roll back to FAILED so the UI can surface the error
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

export async function listBillingImportBatches(input?: {
  status?: ImportBatchStatus;
  page?: number;
  pageSize?: number;
}): Promise<{
  batches: BillingImportBatchListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = input?.page ?? 1;
  const pageSize = input?.pageSize ?? 25;
  const skip = (page - 1) * pageSize;
  const where = input?.status ? { status: input.status } : {};

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

export async function getBillingImportBatchDetail(batchId: string): Promise<BillingImportBatchDetail> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    include: { billingPeriod: true },
  });
  if (!batch) throw new NotFoundError('ImportBatch', batchId);

  // Attempt to retrieve rows from storage for PENDING batches
  // (COMPLETED/FAILED batches may no longer have the file available)
  let rows: unknown[] = [];
  if (batch.status === 'PENDING') {
    const errorLogObj = (batch.errorLog ?? {}) as Record<string, unknown>;
    // Use rows from errorLog if available (may have been edited inline)
    const storedRows = errorLogObj['rows'];
    if (Array.isArray(storedRows) && storedRows.length > 0) {
      rows = storedRows;
    } else {
      // Fall back to re-parsing Excel from storage
      const storageKey = errorLogObj['storageKey'] as string | null;
      if (storageKey) {
        try {
          const storage = getStorage();
          const buffer = await storage.downloadFile(storageKey);
          const parsed = parseFullWorkbook(new Uint8Array(buffer));
          rows = parsed.floors.flatMap((f) => f.rows);
        } catch {
          // Storage file unavailable — rows remain []
        }
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

export async function updateBillingImportBatchRow(
  batchId: string,
  rowId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError('ImportBatch', batchId);
  if (batch.status !== 'PENDING') {
    throw new BadRequestError(
      `Batch ${batchId} is ${batch.status} — only PENDING batches can be edited.`,
    );
  }

  const errorLogObj = (batch.errorLog ?? {}) as Record<string, unknown>;
  const rows = errorLogObj['rows'];

  if (!Array.isArray(rows)) {
    throw new BadRequestError('Batch rows are not stored for inline editing. Re-upload the workbook.');
  }

  const rowIndex = Number(rowId);
  if (!Number.isFinite(rowIndex) || rowIndex < 0 || rowIndex >= rows.length) {
    throw new BadRequestError(`Invalid row index: ${rowId}`);
  }

  const existingRow = rows[rowIndex] as Record<string, unknown>;
  if (!existingRow) {
    throw new NotFoundError('BatchRow', rowId);
  }

  // Map API field names to row field names
  // API: waterAmount → row.waterTotal, electricAmount → row.electricTotal
  const fieldMap: Record<string, string> = {
    roomNumber: 'roomNo',
    rentAmount: 'rentAmount',
    waterAmount: 'waterTotal',
    electricAmount: 'electricTotal',
    furnitureAmount: 'furnitureFee',
    otherAmount: 'otherFee',
    totalAmount: 'totalDue',
    note: 'note',
  };

  // Apply updates to the row
  const updatedRow = { ...existingRow };
  for (const [apiField, rowField] of Object.entries(fieldMap)) {
    if (apiField in input) {
      updatedRow[rowField] = input[apiField];
    }
  }

  // Recalculate totalAmount from components if any component changed
  const hasComponentChange = Object.keys(fieldMap).some(
    (f) => f in input && ['rentAmount', 'waterAmount', 'electricAmount', 'furnitureAmount', 'otherAmount'].includes(f),
  );
  if (hasComponentChange) {
    const rent = Number(updatedRow['rentAmount']) || 0;
    const water = Number(updatedRow['waterTotal']) || 0;
    const electric = Number(updatedRow['electricTotal']) || 0;
    const furniture = Number(updatedRow['furnitureFee']) || 0;
    const other = Number(updatedRow['otherFee']) || 0;
    updatedRow['totalDue'] = rent + water + electric + furniture + other;
  }

  // Update the rows array
  const updatedRows = [...rows];
  updatedRows[rowIndex] = updatedRow;

  // Persist back to errorLog
  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      errorLog: {
        ...errorLogObj,
        rows: updatedRows,
      },
    },
  });

  return updatedRow;
}
