/**
 * Phase 8.1: Financial Audit Log Service
 *
 * Append-only, transaction-atomic audit trail with before/after/diff.
 * MUST be called INSIDE the same transaction as the entity change
 * to guarantee atomic commit/rollback.
 *
 * Usage:
 *   await withTransaction(async (tx) => {
 *     const before = await tx.invoice.findUnique({ where: { id } });
 *     // ... mutation ...
 *     const after = await tx.invoice.findUnique({ where: { id } });
 *     await logFinancialAudit({ tx, entityType: 'Invoice', entityId: id,
 *       action: 'INVOICE_CANCELLED', before, after, performedBy, correlationId });
 *   });
 */

import { Prisma } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinancialAuditInput {
  tx: Prisma.TransactionClient;
  entityType: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  performedBy: string;
  performedByName?: string;
  correlationId?: string;
}

// ─── Diff computation ─────────────────────────────────────────────────────────

export interface DiffChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface DiffResult {
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  changes?: DiffChange[];
}

export function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffResult {
  if (!before) {
    return {
      type: 'CREATE',
      changes: after ? Object.keys(after).map((k) => ({ field: k, before: null, after: after[k] })) : [],
    };
  }
  if (!after) {
    return {
      type: 'DELETE',
      changes: Object.keys(before).map((k) => ({ field: k, before: before[k], after: null })),
    };
  }

  const changes: DiffChange[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changes.push({ field: key, before: before[key], after: after[key] });
    }
  }

  return { type: changes.length > 0 ? 'UPDATE' : 'CREATE', changes };
}

// ─── Strip relation bloat from entities ──────────────────────────────────────

/**
 * Removes Prisma-relation fields that cause circular serialization issues
 * and bloat in the audit log. Keeps only scalar fields + simple values.
 */
function serializeEntity(entity: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!entity) return null;
  const serialized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    if (
      v === null ||
      v === undefined ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      v instanceof Date ||
      Array.isArray(v)
    ) {
      serialized[k] = v;
    } else if (typeof v === 'object' && !Array.isArray(v)) {
      // flatten nested objects at one level
      serialized[k] = JSON.parse(JSON.stringify(v));
    }
  }
  return serialized;
}

// ─── Core function ─────────────────────────────────────────────────────────────

export async function logFinancialAudit(input: FinancialAuditInput): Promise<void> {
  const { tx, entityType, entityId, action, before, after, performedBy, performedByName, correlationId } = input;

  const diff = computeDiff(
    serializeEntity(before) as Record<string, unknown> | null,
    serializeEntity(after) as Record<string, unknown> | null,
  );

  await (tx as unknown as Prisma.TransactionClient).financialAuditLog.create({
    data: {
      id: uuidv4(),
      entityType,
      entityId,
      action,
      before: before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
      diff: diff as unknown as Prisma.InputJsonValue,
      performedBy,
      performedByName: performedByName ?? null,
      correlationId: correlationId ?? null,
      timestamp: new Date(),
    },
  });
}

// ─── Read API ─────────────────────────────────────────────────────────────────

export async function getFinancialAuditForEntity(
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<Array<{
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  diff: DiffResult;
  performedBy: string;
  performedByName: string | null;
  correlationId: string | null;
  timestamp: Date;
}>> {
  // Import here to avoid circular deps — read from the real prisma client
  const { prisma } = await import('@/lib');
  const rows = await prisma.financialAuditLog.findMany({
    where: { entityType, entityId },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  return rows as unknown as Array<{
    id: string; entityType: string; entityId: string; action: string;
    before: unknown; after: unknown; diff: DiffResult;
    performedBy: string; performedByName: string | null;
    correlationId: string | null; timestamp: Date;
  }>;
}