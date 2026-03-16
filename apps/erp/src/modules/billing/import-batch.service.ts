import { prisma } from '@/lib';
import { BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { parseBillingWorkbookDetailed } from './import-parser';
import type { BillingImportRow as ParsedBillingImportRow } from './types';
import type { BillingImportBatchStatus, BillingImportRowStatus } from '@prisma/client';
import { getBillingService } from './billing.service';

type PreviewWarning = {
  roomNumber: string;
  year: number;
  month: number;
  expectedTotal: number;
  calculatedTotal: number;
  difference: number;
};

type PreviewGroup = {
  roomNumber: string;
  year: number;
  month: number;
  total: number;
  count: number;
};

export type BillingImportPreviewResult = {
  rows: ParsedBillingImportRow[];
  preview: PreviewGroup[];
  warnings: PreviewWarning[];
  batch: {
    id: string;
    status: BillingImportBatchStatus;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
    billingCycleId: string;
  };
};

type ValidationIssue = {
  field?: string;
  message?: string;
  code?: string;
};

export type BillingImportBatchListItem = {
  id: string;
  uploadedFileId: string | null;
  sourceFilename: string;
  templateVersion: string | null;
  status: BillingImportBatchStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  createdAt: Date;
  importedAt: Date | null;
  billingCycle: {
    id: string;
    year: number;
    month: number;
    status: string;
    building: {
      id: string;
      name: string;
    } | null;
  } | null;
};

export type BillingImportBatchRowDetail = {
  id: string;
  rowNo: number;
  sourceSheet: string | null;
  sourceRow: number | null;
  roomNumber: string;
  tenantName: string | null;
  rentAmount: number | null;
  waterAmount: number | null;
  electricAmount: number | null;
  furnitureAmount: number | null;
  otherAmount: number | null;
  totalAmount: number | null;
  note: string | null;
  validationStatus: BillingImportRowStatus;
  validationErrors: ValidationIssue[];
  matchedRoom: {
    id: string;
    roomNumber: string;
  } | null;
  matchedContract: {
    id: string;
    primaryTenantName: string | null;
  } | null;
  importedBillingRecordId: string | null;
  parsedJson: unknown;
};

export type BillingImportBatchDetail = BillingImportBatchListItem & {
  rows: BillingImportBatchRowDetail[];
};

export type UpdateBillingImportBatchRowInput = {
  roomNumber?: string;
  rentAmount?: number | null;
  waterAmount?: number | null;
  electricAmount?: number | null;
  furnitureAmount?: number | null;
  otherAmount?: number | null;
  totalAmount?: number | null;
  note?: string | null;
};

function decimalOrNull(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseValidationIssues(value: unknown): ValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const issue = item as Record<string, unknown>;
      return {
        field: typeof issue.field === 'string' ? issue.field : undefined,
        message: typeof issue.message === 'string' ? issue.message : undefined,
        code: typeof issue.code === 'string' ? issue.code : undefined,
      };
    });
}

function serializeBatchListItem(batch: {
  id: string;
  uploadedFileId: string | null;
  sourceFilename: string;
  templateVersion: string | null;
  status: BillingImportBatchStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  createdAt: Date;
  importedAt: Date | null;
  billingCycle: {
    id: string;
    year: number;
    month: number;
    status: string;
    building: {
      id: string;
      name: string;
    } | null;
  } | null;
  importRows?: Array<{ validationStatus: BillingImportRowStatus }>;
}): BillingImportBatchListItem {
  return {
    id: batch.id,
    uploadedFileId: batch.uploadedFileId,
    sourceFilename: batch.sourceFilename,
    templateVersion: batch.templateVersion,
    status: batch.status,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    warningRows: batch.importRows?.filter((row) => row.validationStatus === 'WARNING').length ?? 0,
    createdAt: batch.createdAt,
    importedAt: batch.importedAt,
    billingCycle: batch.billingCycle,
  };
}

function serializeBatchRow(row: {
  id: string;
  rowNo: number;
  sourceSheet: string | null;
  sourceRow: number | null;
  roomNumber: string;
  tenantName: string | null;
  rentAmount: unknown;
  waterAmount: unknown;
  electricAmount: unknown;
  furnitureAmount: unknown;
  otherAmount: unknown;
  totalAmount: unknown;
  note: string | null;
  validationStatus: BillingImportRowStatus;
  validationErrorsJson: unknown;
  importedBillingRecordId: string | null;
  parsedJson: unknown;
  matchedRoom: {
    id: string;
    roomNumber: string;
  } | null;
  matchedContract: {
    id: string;
    primaryTenant?: {
      firstName: string;
      lastName: string;
    } | null;
  } | null;
}): BillingImportBatchRowDetail {
  const primaryTenant = row.matchedContract?.primaryTenant;
  const primaryTenantName = primaryTenant
    ? `${primaryTenant.firstName} ${primaryTenant.lastName}`.trim()
    : null;

  return {
    id: row.id,
    rowNo: row.rowNo,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    roomNumber: row.roomNumber,
    tenantName: row.tenantName,
    rentAmount: decimalOrNull(row.rentAmount),
    waterAmount: decimalOrNull(row.waterAmount),
    electricAmount: decimalOrNull(row.electricAmount),
    furnitureAmount: decimalOrNull(row.furnitureAmount),
    otherAmount: decimalOrNull(row.otherAmount),
    totalAmount: decimalOrNull(row.totalAmount),
    note: row.note,
    validationStatus: row.validationStatus,
    validationErrors: parseValidationIssues(row.validationErrorsJson),
    matchedRoom: row.matchedRoom,
    matchedContract: row.matchedContract
      ? {
          id: row.matchedContract.id,
          primaryTenantName,
        }
      : null,
    importedBillingRecordId: row.importedBillingRecordId,
    parsedJson: row.parsedJson,
  };
}

async function refreshBatchCounts(batchId: string) {
  const [totalRows, invalidRows, nonBlockingRows] = await Promise.all([
    prisma.billingImportRow.count({ where: { batchId } }),
    prisma.billingImportRow.count({ where: { batchId, validationStatus: 'ERROR' } }),
    prisma.billingImportRow.count({
      where: {
        batchId,
        validationStatus: { in: ['VALID', 'WARNING'] },
      },
    }),
  ]);

  await prisma.billingImportBatch.update({
    where: { id: batchId },
    data: {
      totalRows,
      validRows: nonBlockingRows,
      invalidRows,
      status: 'VALIDATED',
    },
  });
}

function toDecimalValue(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

async function getDefaultDays(): Promise<{ billingDay: number; dueDay: number; overdueDay: number }> {
  const configs = await prisma.config.findMany({
    where: { key: { in: ['billing.billingDay', 'billing.dueDay', 'billing.overdueDay'] } },
  });
  const getValue = (key: string, fallback: number) => {
    const item = configs.find((entry) => entry.key === key);
    return item ? Number(item.value) : fallback;
  };

  return {
    billingDay: getValue('billing.billingDay', 1),
    dueDay: getValue('billing.dueDay', 5),
    overdueDay: getValue('billing.overdueDay', 15),
  };
}

function groupParsedRows(rows: ParsedBillingImportRow[]): Map<string, ParsedBillingImportRow[]> {
  const groups = new Map<string, ParsedBillingImportRow[]>();
  for (const row of rows) {
    const key = `${row.roomNumber}:${row.year}:${row.month}`;
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  }
  return groups;
}

function buildWarnings(
  preview: PreviewGroup[],
  summaryRows: Array<{ roomNumber: string; year: number; month: number; declaredTotalAmount?: number }>,
): PreviewWarning[] {
  const previewMap = new Map(preview.map((item) => [`${item.roomNumber}:${item.year}:${item.month}`, item]));
  return summaryRows
    .map((row) => {
      if (row.declaredTotalAmount == null) return null;
      const key = `${row.roomNumber}:${row.year}:${row.month}`;
      const grouped = previewMap.get(key);
      if (!grouped) return null;
      const difference = Number((grouped.total - row.declaredTotalAmount).toFixed(2));
      if (Math.abs(difference) < 0.01) return null;
      return {
        roomNumber: row.roomNumber,
        year: row.year,
        month: row.month,
        expectedTotal: row.declaredTotalAmount,
        calculatedTotal: grouped.total,
        difference,
      };
    })
    .filter((warning): warning is PreviewWarning => warning !== null);
}

function extractAmount(rows: ParsedBillingImportRow[], typeCode: ParsedBillingImportRow['typeCode']): number | undefined {
  const match = rows.find((row) => row.typeCode === typeCode);
  return match ? match.quantity * match.unitPrice : undefined;
}

async function stageBillingImportBatch(input: {
  filename: string;
  fileBuffer: Uint8Array;
  uploadedFileId?: string | null;
  batchId?: string;
}): Promise<BillingImportPreviewResult> {
  const parsed = parseBillingWorkbookDetailed(input.fileBuffer);
  if (!parsed.rows.length) {
    throw new BadRequestError('Workbook is empty');
  }

  const periods = Array.from(new Set(parsed.rows.map((row) => `${row.year}:${row.month}`)));
  if (periods.length !== 1) {
    throw new BadRequestError('One import batch must contain only one billing month');
  }

  const [year, month] = periods[0].split(':').map(Number);
  const building = await prisma.building.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!building) {
    throw new NotFoundError('Building', 'default');
  }

  const { billingDay, dueDay, overdueDay } = await getDefaultDays();
  const billingDate = new Date(year, month - 1, billingDay);
  const dueDate = new Date(year, month - 1, dueDay);
  const overdueDate = new Date(year, month - 1, overdueDay);

  const billingCycle = await prisma.billingCycle.upsert({
    where: {
      buildingId_year_month: {
        buildingId: building.id,
        year,
        month,
      },
    },
    update: {},
    create: {
      buildingId: building.id,
      year,
      month,
      billingDate,
      dueDate,
      overdueDate,
      status: 'OPEN',
      templateVersion: 'summary-v1',
    },
  });

  const grouped = groupParsedRows(parsed.rows);
  const preview = Array.from(grouped.entries()).map(([key, rows]) => {
    const [roomNumber, y, m] = key.split(':');
    return {
      roomNumber,
      year: Number(y),
      month: Number(m),
      total: Number(rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0).toFixed(2)),
      count: rows.length,
    };
  });
  const warnings = buildWarnings(preview, parsed.summaryRows);

  let batch:
    | {
        id: string;
        billingCycleId: string;
      }
    | null = null;

  if (input.batchId) {
    const existing = await prisma.billingImportBatch.findUnique({
      where: { id: input.batchId },
      select: { id: true, status: true, uploadedFileId: true },
    });
    if (!existing) {
      throw new NotFoundError('BillingImportBatch', input.batchId);
    }
    if (existing.status === 'IMPORTED') {
      throw new BadRequestError('Imported batches cannot be rebuilt');
    }

    await prisma.billingImportRow.deleteMany({ where: { batchId: existing.id } });
    batch = await prisma.billingImportBatch.update({
      where: { id: existing.id },
      data: {
        billingCycleId: billingCycle.id,
        uploadedFileId: input.uploadedFileId ?? existing.uploadedFileId,
        sourceFilename: input.filename,
        templateVersion: 'summary-v1',
        status: 'UPLOADED',
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        importedAt: null,
      },
      select: {
        id: true,
        billingCycleId: true,
      },
    });
  } else {
    const existingBatchIds = await prisma.billingImportBatch.findMany({
      where: { billingCycleId: billingCycle.id, status: { in: ['UPLOADED', 'VALIDATED'] } },
      select: { id: true },
    });
    if (existingBatchIds.length) {
      await prisma.billingImportRow.deleteMany({
        where: { batchId: { in: existingBatchIds.map((item) => item.id) } },
      });
      await prisma.billingImportBatch.deleteMany({
        where: { id: { in: existingBatchIds.map((item) => item.id) } },
      });
    }

    batch = await prisma.billingImportBatch.create({
      data: {
        billingCycleId: billingCycle.id,
        uploadedFileId: input.uploadedFileId ?? null,
        sourceFilename: input.filename,
        templateVersion: 'summary-v1',
        status: 'UPLOADED',
      },
      select: {
        id: true,
        billingCycleId: true,
      },
    });
  }

  let validRows = 0;
  let invalidRows = 0;

  const warningMap = new Map(warnings.map((item) => [`${item.roomNumber}:${item.year}:${item.month}`, item]));

  let rowNo = 1;
  for (const group of preview) {
    const key = `${group.roomNumber}:${group.year}:${group.month}`;
    const groupRows = grouped.get(key) || [];
    const room = await prisma.room.findFirst({
      where: { roomNumber: group.roomNumber },
      include: {
        contracts: {
          where: { status: 'ACTIVE' },
          orderBy: { startDate: 'desc' },
          take: 1,
          include: { primaryTenant: true },
        },
      },
    });

    const activeContract = room?.contracts?.[0] || null;
    const warning = warningMap.get(key);
    const validationErrors: Array<{ field: string; message: string; code: string }> = [];
    if (!room) {
      validationErrors.push({ field: 'roomNumber', message: 'Room not found', code: 'ROOM_NOT_FOUND' });
    }
    if (warning) {
      validationErrors.push({
        field: 'totalAmount',
        message: `Declared total ${warning.expectedTotal} does not match calculated total ${warning.calculatedTotal}`,
        code: 'TOTAL_MISMATCH',
      });
    }

    const validationStatus: BillingImportRowStatus =
      validationErrors.some((item) => item.code === 'ROOM_NOT_FOUND')
        ? 'ERROR'
        : warning
          ? 'WARNING'
          : 'VALID';

    if (validationStatus === 'ERROR') invalidRows += 1;
    else validRows += 1;

    const summary = parsed.summaryRows.find(
      (item) => item.roomNumber === group.roomNumber && item.year === group.year && item.month === group.month,
    );

    await prisma.billingImportRow.create({
      data: {
        batchId: batch.id,
        rowNo,
        sourceSheet: 'Workbook',
        sourceRow: rowNo + 1,
        roomNumber: group.roomNumber,
        floorNo: room?.floorId ? undefined : undefined,
        tenantName: activeContract
          ? `${activeContract.primaryTenant.firstName} ${activeContract.primaryTenant.lastName}`.trim()
          : null,
        rentAmount: toDecimalValue(extractAmount(groupRows, 'RENT')),
        waterAmount: toDecimalValue(extractAmount(groupRows, 'WATER')),
        electricAmount: toDecimalValue(extractAmount(groupRows, 'ELECTRIC')),
        furnitureAmount: toDecimalValue(extractAmount(groupRows, 'FACILITY')),
        otherAmount: toDecimalValue(extractAmount(groupRows, 'OTHER')),
        totalAmount: toDecimalValue(summary?.declaredTotalAmount ?? group.total),
        note: groupRows.find((item) => item.typeCode === 'OTHER')?.description || null,
        parsedJson: {
          roomNumber: group.roomNumber,
          rows: groupRows,
          warning,
        },
        validationStatus,
        validationErrorsJson: validationErrors.length ? validationErrors : null,
        matchedRoomId: room?.id || null,
        matchedContractId: activeContract?.id || null,
      },
    });
    rowNo += 1;
  }

  const updatedBatch = await prisma.billingImportBatch.update({
    where: { id: batch.id },
    data: {
      totalRows: preview.length,
      validRows,
      invalidRows,
      status: 'VALIDATED',
    },
  });

  return {
    rows: parsed.rows,
    preview,
    warnings,
    batch: {
      id: updatedBatch.id,
      status: updatedBatch.status,
      totalRows: updatedBatch.totalRows,
      validRows: updatedBatch.validRows,
      invalidRows: updatedBatch.invalidRows,
      warningRows: warnings.length,
      billingCycleId: updatedBatch.billingCycleId,
    },
  };
}

export async function createBillingImportPreviewBatch(input: {
  filename: string;
  fileBuffer: Uint8Array;
  uploadedFileId?: string | null;
}): Promise<BillingImportPreviewResult> {
  return stageBillingImportBatch(input);
}

export async function rebuildBillingImportBatchFromWorkbook(input: {
  batchId: string;
  filename: string;
  fileBuffer: Uint8Array;
  uploadedFileId?: string | null;
}): Promise<BillingImportPreviewResult> {
  return stageBillingImportBatch(input);
}

export async function listBillingImportBatches(input?: {
  status?: BillingImportBatchStatus;
  page?: number;
  pageSize?: number;
}): Promise<{
  batches: BillingImportBatchListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(input?.page ?? 1, 1);
  const pageSize = Math.min(Math.max(input?.pageSize ?? 25, 1), 100);
  const where = input?.status ? { status: input.status } : {};

  const [rows, total] = await Promise.all([
    prisma.billingImportBatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        billingCycle: {
          include: {
            building: {
              select: { id: true, name: true },
            },
          },
        },
        importRows: {
          select: { validationStatus: true },
        },
      },
    }),
    prisma.billingImportBatch.count({ where }),
  ]);

  return {
    batches: rows.map(serializeBatchListItem),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getBillingImportBatchDetail(batchId: string): Promise<BillingImportBatchDetail> {
  const batch = await prisma.billingImportBatch.findUnique({
    where: { id: batchId },
    include: {
      billingCycle: {
        include: {
          building: {
            select: { id: true, name: true },
          },
        },
      },
      importRows: {
        orderBy: { rowNo: 'asc' },
        include: {
          matchedRoom: {
            select: { id: true, roomNumber: true },
          },
          matchedContract: {
            select: {
              id: true,
              primaryTenant: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!batch) {
    throw new NotFoundError('BillingImportBatch', batchId);
  }

  const listItem = serializeBatchListItem(batch);
  return {
    ...listItem,
    rows: batch.importRows.map(serializeBatchRow),
  };
}

export async function updateBillingImportBatchRow(
  batchId: string,
  rowId: string,
  input: UpdateBillingImportBatchRowInput,
): Promise<BillingImportBatchRowDetail> {
  const existing = await prisma.billingImportRow.findFirst({
    where: { id: rowId, batchId },
    include: {
      batch: true,
    },
  });

  if (!existing) {
    throw new NotFoundError('BillingImportRow', rowId);
  }

  if (existing.batch.status === 'IMPORTED') {
    throw new BadRequestError('Imported batches cannot be edited');
  }

  const roomNumber = input.roomNumber?.trim() || existing.roomNumber;
  const rentAmount = input.rentAmount === undefined ? decimalOrNull(existing.rentAmount) : input.rentAmount;
  const waterAmount = input.waterAmount === undefined ? decimalOrNull(existing.waterAmount) : input.waterAmount;
  const electricAmount = input.electricAmount === undefined ? decimalOrNull(existing.electricAmount) : input.electricAmount;
  const furnitureAmount =
    input.furnitureAmount === undefined ? decimalOrNull(existing.furnitureAmount) : input.furnitureAmount;
  const otherAmount = input.otherAmount === undefined ? decimalOrNull(existing.otherAmount) : input.otherAmount;
  const providedTotalAmount =
    input.totalAmount === undefined ? decimalOrNull(existing.totalAmount) : input.totalAmount;
  const note = input.note === undefined ? existing.note : input.note;

  const calculatedTotal = [rentAmount, waterAmount, electricAmount, furnitureAmount, otherAmount].reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  );

  const room = await prisma.room.findFirst({
    where: { roomNumber, isActive: true },
    include: {
      contracts: {
        where: { status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        take: 1,
        include: {
          primaryTenant: true,
        },
      },
    },
  });

  const activeContract = room?.contracts?.[0] ?? null;
  const validationErrors: ValidationIssue[] = [];

  if (!room) {
    validationErrors.push({
      field: 'roomNumber',
      message: 'Room not found',
      code: 'ROOM_NOT_FOUND',
    });
  }

  if (providedTotalAmount != null) {
    const difference = Number((calculatedTotal - providedTotalAmount).toFixed(2));
    if (Math.abs(difference) >= 0.01) {
      validationErrors.push({
        field: 'totalAmount',
        message: `Declared total ${providedTotalAmount} does not match calculated total ${Number(calculatedTotal.toFixed(2))}`,
        code: 'TOTAL_MISMATCH',
      });
    }
  }

  const validationStatus: BillingImportRowStatus =
    validationErrors.some((item) => item.code === 'ROOM_NOT_FOUND')
      ? 'ERROR'
      : validationErrors.length > 0
        ? 'WARNING'
        : 'VALID';

  const parsedJson =
    existing.parsedJson && typeof existing.parsedJson === 'object' && !Array.isArray(existing.parsedJson)
      ? {
          ...existing.parsedJson,
          manualOverride: true,
          calculatedTotal: Number(calculatedTotal.toFixed(2)),
        }
      : {
          manualOverride: true,
          calculatedTotal: Number(calculatedTotal.toFixed(2)),
        };

  const updated = await prisma.billingImportRow.update({
    where: { id: existing.id },
    data: {
      roomNumber,
      tenantName: activeContract
        ? `${activeContract.primaryTenant.firstName} ${activeContract.primaryTenant.lastName}`.trim()
        : existing.tenantName,
      rentAmount: rentAmount == null ? null : rentAmount,
      waterAmount: waterAmount == null ? null : waterAmount,
      electricAmount: electricAmount == null ? null : electricAmount,
      furnitureAmount: furnitureAmount == null ? null : furnitureAmount,
      otherAmount: otherAmount == null ? null : otherAmount,
      totalAmount: providedTotalAmount == null ? null : providedTotalAmount,
      note,
      parsedJson,
      validationStatus,
      validationErrorsJson: validationErrors.length ? validationErrors : null,
      matchedRoomId: room?.id ?? null,
      matchedContractId: activeContract?.id ?? null,
      importedBillingRecordId: null,
    },
    include: {
      matchedRoom: {
        select: { id: true, roomNumber: true },
      },
      matchedContract: {
        select: {
          id: true,
          primaryTenant: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  });

  await refreshBatchCounts(batchId);

  return serializeBatchRow(updated);
}

export async function executeBillingImportBatch(batchId: string): Promise<{
  batchId: string;
  cycleId: string;
  totalImported: number;
  created: Array<{ roomNumber: string; year: number; month: number; billingRecordId: string }>;
}> {
  const batch = await prisma.billingImportBatch.findUnique({
    where: { id: batchId },
    include: {
      billingCycle: true,
      importRows: true,
    },
  });
  if (!batch) {
    throw new NotFoundError('BillingImportBatch', batchId);
  }
  if (batch.status === 'IMPORTED') {
    throw new BadRequestError('Batch already imported');
  }

  const blockingRows = batch.importRows.filter((row) => row.validationStatus === 'ERROR');
  if (blockingRows.length) {
    throw new BadRequestError('Batch still contains validation errors');
  }

  const rows: ParsedBillingImportRow[] = [];
  for (const row of batch.importRows) {
    const base = {
      roomNumber: row.roomNumber,
      year: batch.billingCycle.year,
      month: batch.billingCycle.month,
    };
    if (row.rentAmount && Number(row.rentAmount) > 0) {
      rows.push({ ...base, typeCode: 'RENT', quantity: 1, unitPrice: Number(row.rentAmount) });
    }
    if (row.waterAmount && Number(row.waterAmount) > 0) {
      rows.push({ ...base, typeCode: 'WATER', quantity: 1, unitPrice: Number(row.waterAmount) });
    }
    if (row.electricAmount && Number(row.electricAmount) > 0) {
      rows.push({ ...base, typeCode: 'ELECTRIC', quantity: 1, unitPrice: Number(row.electricAmount) });
    }
    if (row.furnitureAmount && Number(row.furnitureAmount) > 0) {
      rows.push({
        ...base,
        typeCode: 'FACILITY',
        quantity: 1,
        unitPrice: Number(row.furnitureAmount),
        description: 'Furniture charge',
      });
    }
    if (row.otherAmount && Number(row.otherAmount) > 0) {
      rows.push({
        ...base,
        typeCode: 'OTHER',
        quantity: 1,
        unitPrice: Number(row.otherAmount),
        description: row.note || undefined,
      });
    }
  }

  const billingService = getBillingService();
  const result = await billingService.importBillingRows(rows);

  const billingMap = new Map(result.created.map((item) => [`${item.roomNumber}:${item.year}:${item.month}`, item.billingRecordId]));
  for (const row of batch.importRows) {
    const key = `${row.roomNumber}:${batch.billingCycle.year}:${batch.billingCycle.month}`;
    const billingRecordId = billingMap.get(key);
    if (!billingRecordId) continue;
    await prisma.billingImportRow.update({
      where: { id: row.id },
      data: { importedBillingRecordId: billingRecordId },
    });
  }

  await prisma.billingImportBatch.update({
    where: { id: batch.id },
    data: {
      status: 'IMPORTED',
      importedAt: new Date(),
    },
  });
  await prisma.billingCycle.update({
    where: { id: batch.billingCycleId },
    data: { status: 'IMPORTED' },
  });

  return {
    batchId: batch.id,
    cycleId: batch.billingCycleId,
    totalImported: result.created.length,
    created: result.created,
  };
}
