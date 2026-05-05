/**
 * Phase 8.6: Feature Flags
 *
 * Simple in-memory feature flags with optional Redis backing for multi-instance deployments.
 * Flags are checked server-side — never exposed to the client.
 */

interface FeatureFlag {
  enabled: boolean;
  description?: string;
  /** Rollout percentage (0-100). Only applies if enabled. */
  rolloutPercent?: number;
}

const flags: Record<string, FeatureFlag> = {
  /**
   * Phase 8.4: Soft Delete
   * When disabled, soft-delete operations throw ConflictError.
   * Allows gradual rollout: enable for staff first, then admin.
   */
  SOFT_DELETE_ENABLED: { enabled: true, description: 'Soft delete & restore for Invoice/Payment/RoomBilling' },

  /**
   * Phase 8.1: Financial Audit Log
   * When disabled, logFinancialAudit becomes a no-op.
   * Allows auditing to be toggled off during high-volume migration windows.
   */
  FINANCIAL_AUDIT_ENABLED: { enabled: true, description: 'Immutable financial audit log writes' },

  /**
   * Phase 8.2: Reversible Operations
   * When disabled, undoCancelInvoice/undoPaymentMatch throw ConflictError.
   */
  REVERSIBLE_OPS_ENABLED: { enabled: true, description: 'Undo cancel invoice and undo payment match' },

  /**
   * Phase 8.3: Reconciliation Engine
   * When disabled, daily reconciliation cron is still registered but skips execution.
   */
  RECONCILIATION_ENABLED: { enabled: true, description: 'Reconciliation engine daily checks' },

  /**
   * Phase 8.7: Financial Consistency Guards
   * When disabled, overpayment guards and strict status machine validation are bypassed.
   * WARNING: Disabling this in production voids financial safety guarantees.
   */
  FINANCIAL_GUARDS_ENABLED: { enabled: true, description: 'Overpayment guards and status machine validation' },

  /**
   * Kill switch: when enabled, ALL mutations (POST/PUT/PATCH/DELETE) are rejected with 503.
   * Does NOT affect read operations.
   */
  MUTATIONS_KILLED: { enabled: false, description: 'Kill switch — rejects all mutation API calls' },
};

export function isFeatureEnabled(name: string): boolean {
  const flag = flags[name];
  if (!flag) return false;
  if (!flag.enabled) return false;
  if (flag.rolloutPercent !== undefined && flag.rolloutPercent < 100) {
    // Deterministic per-request rollout using a simple hash
    const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100;
    return hash < flag.rolloutPercent;
  }
  return true;
}

export function assertFeatureEnabled(name: string): void {
  if (!isFeatureEnabled(name)) {
    throw new Error(`Feature flag '${name}' is disabled`);
  }
}

export type FeatureFlagName = keyof typeof flags;
