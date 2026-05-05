/**
 * Import Session Service — Gap 1: Billing Import Session Idempotency
 *
 * Provides batch-level idempotency for billing imports.
 * A session tracks one logical import of a file (same billing period + same normalized data).
 *
 * Key design:
 * - normalizedHash is order-insensitive: same rows in different order = same hash
 * - Same normalizedHash + billingPeriodId = REJECTED without forceImport=true
 * - forceImport requires explicit admin action (not just re-upload)
 * - ImportSession is LOCKED (PROCESSING) while import runs — no concurrent execution
 * - ImportSession links to ImportBatch for audit trail
 */

import { createHash } from 'crypto';
import type { ImportSessionStatus, Prisma } from '@prisma/client';
import { ConflictError } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import type { RoomBillingRow } from './import-parser';

export interface ImportSessionCreateInput {
  billingPeriodId: string;
  filename: string;
  fileHash: string;
  normalizedHash: string;
  totalRows: number;
  importedBy: string;
  forceImport?: boolean;
}

export interface ImportSessionStats {
  importedRows: number;
  skippedRows: number;
  errorRows: number;
}

export interface CreateImportSessionResult {
  sessionId: string;
  importSessionId: string;
  normalizedHash: string;
  isDuplicate: boolean;
  existingSession?: {
    id: string;
    status: ImportSessionStatus;
    createdAt: Date;
    filename: string;
  };
}

/**
 * Compute SHA256 of raw file bytes.
 */
export function computeFileHash(buffer: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

/**
 * Compute order-insensitive hash of billing rows.
 * Sort rows by roomNo, serialize to JSON, then SHA256.
 * Empty rows are ignored in computation.
 */
export function computeNormalizedHash(rows: RoomBillingRow[]): string {
  const sorted = [...rows]
    .filter((r) => r.roomNo && r.roomNo.trim().length > 0)
    .sort((a, b) => String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true }));

  const serialized = JSON.stringify(sorted, Object.keys(sorted[0] ?? {}).sort());
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Create a new ImportSession within a transaction.
 *
 * Throws ConflictError if:
 * - A session with the same normalizedHash + billingPeriodId already exists
 * - That session is not COMPLETED/FAILED/CANCELLED (i.e., still PROCESSING)
 * - forceImport is false
 *
 * With forceImport=true, always creates a new session (allows re-import).
 */
export async function createImportSession(
  tx: Prisma.TransactionClient,
  input: ImportSessionCreateInput,
): Promise<CreateImportSessionResult> {
  const { billingPeriodId, filename, fileHash, normalizedHash, totalRows, importedBy, forceImport = false } = input;

  if (forceImport) {
    // Force import: create session without checking for duplicates
    const session = await tx.importSession.create({
      data: {
        billingPeriodId,
        filename,
        fileHash,
        normalizedHash,
        totalRows,
        status: 'PROCESSING',
        importedBy,
        forceImport: true,
      },
    });
    return {
      sessionId: session.id,
      importSessionId: session.id,
      normalizedHash,
      isDuplicate: false,
    };
  }

  // Check for existing session with same normalizedHash + billingPeriodId
  const existing = await tx.importSession.findUnique({
    where: {
      import_session_normalized_hash_unique: { billingPeriodId, normalizedHash },
    },
  });

  if (existing) {
    // A session with this normalized data already exists
    if (existing.status === 'PROCESSING') {
      throw new ConflictError(
        `An import session for this billing period with identical data is already in progress ` +
          `(${existing.id}). Please wait for it to complete or cancel it before retrying.`,
        { existingSessionId: existing.id, status: existing.status },
      );
    }
    // COMPLETED, FAILED, or CANCELLED — treat as duplicate
    throw new ConflictError(
      `A session with this file's data has already been imported for this billing period ` +
        `(${existing.id}, status: ${existing.status}). ` +
        `Use "force import" to re-import this file if needed.`,
      {
        existingSessionId: existing.id,
        status: existing.status,
        createdAt: existing.createdAt,
        filename: existing.filename,
      },
    );
  }

  const session = await tx.importSession.create({
    data: {
      billingPeriodId,
      filename,
      fileHash,
      normalizedHash,
      totalRows,
      status: 'PROCESSING',
      importedBy,
      forceImport: false,
    },
  });

  return {
    sessionId: session.id,
    importSessionId: session.id,
    normalizedHash,
    isDuplicate: false,
  };
}

/**
 * Mark an ImportSession as COMPLETED with stats.
 */
export async function completeImportSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  stats: ImportSessionStats,
): Promise<void> {
  await tx.importSession.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      importedRows: stats.importedRows,
      skippedRows: stats.skippedRows,
      errorRows: stats.errorRows,
      completedAt: new Date(),
    },
  });
}

/**
 * Mark an ImportSession as FAILED with error summary.
 */
export async function failImportSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  errorSummary: Record<string, unknown>,
): Promise<void> {
  await tx.importSession.update({
    where: { id: sessionId },
    data: {
      status: 'FAILED',
      errorSummary: errorSummary as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

/**
 * Cancel a PROCESSING ImportSession (admin action).
 */
export async function cancelImportSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
): Promise<void> {
  await tx.importSession.update({
    where: { id: sessionId },
    data: {
      status: 'CANCELLED',
      completedAt: new Date(),
    },
  });
}

/**
 * Get an ImportSession by ID.
 */
export async function getImportSession(sessionId: string) {
  return prisma.importSession.findUnique({
    where: { id: sessionId },
    include: { billingPeriod: true },
  });
}

/**
 * List ImportSessions for a billing period.
 */
export async function listImportSessionsForPeriod(billingPeriodId: string) {
  return prisma.importSession.findMany({
    where: { billingPeriodId },
    orderBy: { createdAt: 'desc' },
  });
}