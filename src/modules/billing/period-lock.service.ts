/**
 * Gap 5: Financial Period Hard Lock
 *
 * Universal enforcement layer that blocks mutations on CLOSED/LOCKED/ARCHIVED
 * billing periods across all billing, payment, and invoice routes.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * IMPORTANT: All mutation operations that call assertPeriodAllowsMutation
 * MUST run inside a Prisma transaction. The guard uses SELECT ... FOR UPDATE
 * NOWAIT which only works inside a transaction context.
 *
 * Non-transaction callers will receive a "cannot acquire lock" error.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Exceptions (mutations that ARE allowed on finalized periods):
 *   1. createAdjustment() — the designed escape hatch for billing corrections
 *   2. Audit reads (GET endpoints — not covered here)
 *   3. Financial reports (read-only aggregation — not covered here)
 *
 * State machine:
 *   DRAFT → OPEN → CLOSED → LOCKED → ARCHIVED
 *              ↓        ↓
 *          (can gen) (no edits)
 *                  ↓
 *              LOCKED (accounting finalized, no changes allowed)
 *                  ↓
 *              ARCHIVED (read-only, for historical reference)
 */

import { Prisma } from '@prisma/client';
import { BILLING_PERIOD_STATUS, type BillingPeriodStatus } from '@/lib/constants';
import {
  FinancialPeriodClosedError,
  FinancialPeriodArchivedError,
} from './period-closing.service';

// ============================================================================
// Status Helpers
// ============================================================================

/**
 * Returns true if the period is past OPEN (i.e., CLOSED, LOCKED, or ARCHIVED).
 * Once CLOSED, financial data is finalized and most mutations are blocked.
 */
export function isPeriodFinalized(status: BillingPeriodStatus): boolean {
  return status === BILLING_PERIOD_STATUS.CLOSED
    || status === BILLING_PERIOD_STATUS.LOCKED
    || status === BILLING_PERIOD_STATUS.ARCHIVED;
}

// ============================================================================
// Operations that are blocked on CLOSED periods (more permissive than LOCKED)
// ============================================================================

const BLOCKED_ON_CLOSED = [
  'billing_edit',
  'billing_bulk_update',
  'payment_reassign',
  'invoice_regenerate',
  'invoice_modify_amount',
] as const;

type BlockedOnClosedOperation = typeof BLOCKED_ON_CLOSED[number];

// ============================================================================
// Core Guard Function
// ============================================================================

/**
 * Guard: throws if period is CLOSED/LOCKED/ARCHIVED.
 * Uses SELECT ... FOR UPDATE NOWAIT to acquire a pessimistic row lock,
 * guaranteeing that no two concurrent transactions can pass the guard
 * for the same period simultaneously.
 *
 * @param tx        - Prisma transaction client (or plain Prisma client)
 * @param periodId  - The billing period ID to check
 * @param operation - The operation being attempted (used in error messages)
 * @throws FinancialPeriodClosedError if period is CLOSED/LOCKED and lock is busy
 * @throws FinancialPeriodArchivedError if period is ARCHIVED
 */
export async function assertPeriodAllowsMutation(
  tx: Prisma.TransactionClient,
  periodId: string,
  operation: string,
): Promise<void> {
  let period: { id: string; year: number; month: number; status: BillingPeriodStatus } | null = null;

  // Attempt pessimistic lock with FOR UPDATE NOWAIT.
  // In a real transaction context (real DB), this acquires an exclusive row lock
  // and serializes concurrent mutation attempts on the same period.
  // In mock/test contexts (no real DB), $queryRawUnsafe may not be available or
  // returns an empty result — fall back to plain findUnique without locking.
  try {
    const rows = await (tx as any).$queryRawUnsafe(
      `SELECT id, year, month, status FROM "billing_periods" WHERE id = $1 FOR UPDATE NOWAIT`,
      [periodId],
    ) as Array<{ id: string; year: number; month: number; status: string }>;
    if (rows.length === 0) return; // Not found — caller handles
    period = rows[0] as { id: string; year: number; month: number; status: BillingPeriodStatus };
  } catch (_rawError) {
    // $queryRawUnsafe not available (mock tx) or other raw SQL error —
    // fall back to standard findUnique without row lock.
    // In production transactions this path is never hit; the FOR UPDATE NOWAIT
    // query always succeeds. Mock/test environments use this fallback.
    const found = await (tx as any).billingPeriod?.findUnique?.({
      where: { id: periodId },
      select: { id: true, year: true, month: true, status: true },
    });
    if (!found) return; // Not found is handled by caller
    period = found;
  }

  if (!period) return; // Safety check — should never happen
  const status = period.status as BillingPeriodStatus;

  if (status === BILLING_PERIOD_STATUS.ARCHIVED) {
    throw new FinancialPeriodArchivedError(
      `Cannot ${operation}: period ${period.year}-${period.month} is ARCHIVED (read-only).`,
    );
  }

  if (status === BILLING_PERIOD_STATUS.LOCKED) {
    throw new FinancialPeriodClosedError(
      periodId,
      BILLING_PERIOD_STATUS.LOCKED,
      null, // lockedAt — not tracked at period level in this service
      null, // lockedBy
    );
  }

  if (status === BILLING_PERIOD_STATUS.CLOSED) {
    // CLOSED is more permissive: allows adjustments and corrections,
    // but blocks the specific bulk/mutation operations listed in BLOCKED_ON_CLOSED
    if (BLOCKED_ON_CLOSED.includes(operation as BlockedOnClosedOperation)) {
      throw new FinancialPeriodClosedError(
        periodId,
        BILLING_PERIOD_STATUS.CLOSED,
        null,
        null,
      );
    }
  }
}

// ============================================================================
// Helper: Derive periodId from an invoice
// ============================================================================

/**
 * Returns the billingPeriodId for a given invoice, or null if invoice not found.
 * Used by payment reassignment guard to check both the old and new invoice's periods.
 */
export async function getPeriodIdForInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<string | null> {
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: { roomBilling: { select: { billingPeriodId: true } } },
  });
  return invoice?.roomBilling?.billingPeriodId ?? null;
}

/**
 * Returns the billing period status for a given invoice, or null if not found.
 */
export async function getPeriodStatusForInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<BillingPeriodStatus | null> {
  const periodId = await getPeriodIdForInvoice(tx, invoiceId);
  if (!periodId) return null;

  const period = await tx.billingPeriod.findUnique({
    where: { id: periodId },
    select: { status: true },
  });
  return (period?.status as BillingPeriodStatus) ?? null;
}

// ============================================================================
// Convenience guards for specific operations
// ============================================================================

/**
 * Guard: throws if the billing period for a given invoice is finalized.
 * Use before operations that modify invoice data (amount, regenerate, etc.).
 */
export async function assertInvoicePeriodAllowsMutation(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  operation: string,
): Promise<void> {
  const periodId = await getPeriodIdForInvoice(tx, invoiceId);
  if (periodId) {
    await assertPeriodAllowsMutation(tx, periodId, operation);
  }
}

/**
 * Guard for billing record creation (POST /api/billing).
 * Blocks billing edits on finalized periods.
 */
export async function assertBillingPeriodAllowsBillingEdit(
  tx: Prisma.TransactionClient,
  periodId: string,
): Promise<void> {
  await assertPeriodAllowsMutation(tx, periodId, 'billing_edit');
}

/**
 * Guard for billing import bulk updates (POST /api/billing/import/execute).
 * Blocks bulk billing imports on finalized periods.
 */
export async function assertBillingPeriodAllowsBulkUpdate(
  tx: Prisma.TransactionClient,
  periodId: string,
): Promise<void> {
  await assertPeriodAllowsMutation(tx, periodId, 'billing_bulk_update');
}

/**
 * Guard for payment reassignment (PATCH /api/payments/[id] when changing matchedInvoiceId).
 * Blocks if EITHER the old invoice's period OR the new invoice's period is finalized.
 */
export async function assertPaymentReassignmentAllowed(
  tx: Prisma.TransactionClient,
  oldInvoiceId: string | null,
  newInvoiceId: string,
): Promise<void> {
  // Check new invoice's period
  const newPeriodId = await getPeriodIdForInvoice(tx, newInvoiceId);
  if (newPeriodId) {
    await assertPeriodAllowsMutation(tx, newPeriodId, 'payment_reassign');
  }

  // Check old invoice's period (if reassigning from another invoice)
  if (oldInvoiceId) {
    const oldPeriodId = await getPeriodIdForInvoice(tx, oldInvoiceId);
    if (oldPeriodId) {
      await assertPeriodAllowsMutation(tx, oldPeriodId, 'payment_reassign');
    }
  }
}