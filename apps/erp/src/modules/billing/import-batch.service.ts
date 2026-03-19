// TODO: This service needs to be rewritten for the new schema.
// BillingImportBatch, BillingImportRow, BillingCycle, Building models have been
// removed and replaced with ImportBatch, BillingPeriod, and RoomBilling.
// All functions below are stubs returning empty/placeholder results.

import type { ImportBatchStatus } from '@prisma/client';
import { BadRequestError } from '@/lib/utils/errors';

export type BillingImportPreviewResult = {
  rows: unknown[];
  preview: unknown[];
  warnings: unknown[];
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

export async function createBillingImportPreviewBatch(_input: {
  filename: string;
  fileBuffer: Uint8Array;
  uploadedFileId?: string | null;
}): Promise<BillingImportPreviewResult> {
  // TODO: Implement for new schema
  throw new BadRequestError('Import not yet implemented for new schema');
}

export async function rebuildBillingImportBatchFromWorkbook(_input: {
  batchId: string;
  filename: string;
  fileBuffer: Uint8Array;
  uploadedFileId?: string | null;
}): Promise<BillingImportPreviewResult> {
  // TODO: Implement for new schema
  throw new BadRequestError('Import not yet implemented for new schema');
}

export async function listBillingImportBatches(_input?: {
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
  // TODO: Implement for new schema using ImportBatch model
  return { batches: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
}

export async function getBillingImportBatchDetail(_batchId: string): Promise<BillingImportBatchDetail> {
  // TODO: Implement for new schema
  throw new BadRequestError('Import not yet implemented for new schema');
}

export async function updateBillingImportBatchRow(
  _batchId: string,
  _rowId: string,
  _input: Record<string, unknown>,
): Promise<unknown> {
  // TODO: Implement for new schema
  throw new BadRequestError('Import not yet implemented for new schema');
}

export async function executeBillingImportBatch(_batchId: string): Promise<{
  batchId: string;
  periodId: string;
  totalImported: number;
}> {
  // TODO: Implement for new schema
  throw new BadRequestError('Import not yet implemented for new schema');
}
