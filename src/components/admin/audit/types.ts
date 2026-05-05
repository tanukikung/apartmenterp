/**
 * Shared type definitions for FinancialAudit UI components.
 * This file has NO server-only imports — safe for client components.
 */

export interface DiffChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface DiffResult {
  changes: DiffChange[];
  hasChanges: boolean;
}

export interface FinancialAuditEntry {
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
  timestamp: string;
  metadata: Record<string, unknown> | null;
}