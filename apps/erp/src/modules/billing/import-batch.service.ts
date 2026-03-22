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
import type { ImportBatchStatus } from '@prisma/client';
import { BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { parseFullWorkbook } from './import-parser';
import { createBillingService } from './billing.service';
import { getStorage } from '@/infrastructure/storage';

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
  const { config } = parsed;

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
      data: { year, month, status: 'OPEN', dueDay: 25 },
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

  // 2. Download file buffer from storage
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
    // 4. Run the full workbook import
    const billingService = createBillingService();
    const result = await billingService.importFullWorkbook(
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

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function updateBillingImportBatchRow(
  _batchId: string,
  _rowId: string,
  _input: Record<string, unknown>,
): Promise<unknown> {
/* eslint-enable @typescript-eslint/no-unused-vars */
  throw new BadRequestError(
    'Row-level editing is not supported. Re-upload the corrected workbook to create a new batch.',
  );
}
