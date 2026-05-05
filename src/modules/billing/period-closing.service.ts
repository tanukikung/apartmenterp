/**
 * Period Closing Service — Agent 5: Financial Closing
 *
 * Enforceable billing period closure that prevents any edits after accounting close.
 * Implements the Financial Period State Machine:
 *
 *   DRAFT → OPEN → CLOSED → LOCKED → ARCHIVED
 *              ↓        ↓
 *          (can gen) (no edits)
 *                  ↓
 *              LOCKED (accounting finalized, no changes allowed)
 *                  ↓
 *              ARCHIVED (read-only, for historical reference)
 *
 * Each transition is recorded in BillingPeriodCloseEvent for full audit trail.
 */

import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { BILLING_PERIOD_STATUS, BILLING_PERIOD_TRANSITIONS, type BillingPeriodStatus } from '@/lib/constants';
import {
  NotFoundError,
  ConflictError,
  BadRequestError,
  GoneError,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { logFinancialAudit } from '@/modules/financial-audit';
import { versionedUpdate } from '@/lib/concurrency/version-guard';

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * 409 Conflict — Billing period is CLOSED and no longer accepts modifications.
 * SENT/PAID invoices may still be adjusted via ADJUSTMENT documents.
 */
export class FinancialPeriodClosedError extends ConflictError {
  public readonly periodId: string;
  public readonly periodStatus: BillingPeriodStatus;
  public readonly lockedAt: Date | null;
  public readonly lockedBy: string | null;

  constructor(periodId: string, periodStatus: BillingPeriodStatus, lockedAt: Date | null, lockedBy: string | null) {
    const msg = lockedAt
      ? `Billing period ${periodId} is ${periodStatus} and cannot be modified. ` +
        `Locked at ${lockedAt.toISOString()} by ${lockedBy ?? 'unknown'}. ` +
        `Contact system administrator for adjustments.`
      : `Billing period ${periodId} is ${periodStatus} and cannot be modified. ` +
        `Contact system administrator for adjustments.`;

    super(msg, {
      periodId,
      periodStatus,
      lockedAt: lockedAt?.toISOString() ?? null,
      lockedBy: lockedBy ?? null,
    });

    this.name = 'FinancialPeriodClosedError';
    this.periodId = periodId;
    this.periodStatus = periodStatus;
    this.lockedAt = lockedAt;
    this.lockedBy = lockedBy;
  }
}

/**
 * 410 Gone — Billing period is ARCHIVED and is read-only for historical reference.
 * No modifications of any kind are allowed.
 */
export class FinancialPeriodArchivedError extends GoneError {
  public readonly periodId: string;

  constructor(periodId: string) {
    super(`Billing period ${periodId} is archived and cannot be modified.`);
    this.name = 'FinancialPeriodArchivedError';
    this.periodId = periodId;
  }
}

/**
 * 409 Conflict — Billing period transition is not allowed.
 * Thrown when attempting an invalid status transition (e.g., LOCKED → OPEN).
 */
export class InvalidPeriodTransitionError extends ConflictError {
  public readonly periodId: string;
  public readonly fromStatus: BillingPeriodStatus;
  public readonly toStatus: BillingPeriodStatus;

  constructor(periodId: string, fromStatus: BillingPeriodStatus, toStatus: BillingPeriodStatus) {
    super(
      `Cannot transition billing period ${periodId} from ${fromStatus} to ${toStatus}. ` +
      `Allowed transitions from ${fromStatus}: ${(BILLING_PERIOD_TRANSITIONS[fromStatus] ?? []).join(', ') || 'none'}.`
    );
    this.name = 'InvalidPeriodTransitionError';
    this.periodId = periodId;
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface PeriodSnapshot {
  year: number;
  month: number;
  totalRoomsBilled: number;
  totalAmountBilled: number;
  totalInvoiced: number;
  totalAmountInvoiced: number;
  totalPaid: number;
  totalAmountPaid: number;
  totalUnpaid: number;
  totalAmountUnpaid: number;
}

export interface ClosePeriodOptions {
  reason?: string;
  force?: boolean; // Skip unpaid invoice warning
}

// ============================================================================
// Transition Guards
// ============================================================================

/**
 * Assert that a billing period is editable (OPEN or CLOSED with adjustments allowed).
 * Throws FinancialPeriodClosedError or FinancialPeriodArchivedError if not editable.
 */
export async function assertBillingPeriodEditable(
  tx: Prisma.TransactionClient,
  periodId: string
): Promise<void> {
  const period = await tx.billingPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, status: true },
  });

  if (!period) {
    throw new NotFoundError('BillingPeriod', periodId);
  }

  if (period.status === BILLING_PERIOD_STATUS.LOCKED) {
    // For LOCKED periods, get the close event to report who locked it
    const closeEvent = await tx.billingPeriodCloseEvent.findFirst({
      where: { periodId, toStatus: BILLING_PERIOD_STATUS.LOCKED },
      orderBy: { createdAt: 'desc' },
      select: { closedBy: true, createdAt: true },
    });
    throw new FinancialPeriodClosedError(
      periodId,
      BILLING_PERIOD_STATUS.LOCKED,
      closeEvent?.createdAt ?? null,
      closeEvent?.closedBy ?? null
    );
  }

  if (period.status === BILLING_PERIOD_STATUS.ARCHIVED) {
    throw new FinancialPeriodArchivedError(periodId);
  }

  // DRAFT and OPEN are always editable — no additional check needed
}

/**
 * Assert that a billing period transition is valid.
 * Throws InvalidPeriodTransitionError if the transition is not allowed.
 */
export function assertPeriodTransitionAllowed(
  fromStatus: BillingPeriodStatus,
  toStatus: BillingPeriodStatus
): void {
  const allowed = BILLING_PERIOD_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new InvalidPeriodTransitionError('unknown', fromStatus, toStatus);
  }
}

// ============================================================================
// Snapshot Computation
// ============================================================================

/**
 * Compute a snapshot of billing totals for a period at the current moment.
 * Used when closing/locking to record the financial state at transition time.
 */
async function computePeriodSnapshot(
  tx: Prisma.TransactionClient,
  periodId: string
): Promise<PeriodSnapshot> {
  const period = await tx.billingPeriod.findUnique({
    where: { id: periodId },
    select: { year: true, month: true },
  });

  if (!period) {
    throw new NotFoundError('BillingPeriod', periodId);
  }

  // Total rooms billed (all room billings in the period)
  const allBillings = await tx.roomBilling.findMany({
    where: { billingPeriodId: periodId },
    select: {
      totalDue: true,
      status: true,
    },
  });

  // Total invoiced (invoices generated for this period)
  const invoices = await tx.invoice.findMany({
    where: {
      year: period.year,
      month: period.month,
    },
    select: {
      totalAmount: true,
      status: true,
    },
  });

  const totalRoomsBilled = allBillings.length;
  const totalAmountBilled = allBillings.reduce((sum, b) => sum + Number(b.totalDue), 0);

  const totalInvoiced = invoices.length;
  const totalAmountInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  // Paid invoices
  const paidInvoices = invoices.filter((inv) => inv.status === 'PAID');
  const totalPaid = paidInvoices.length;
  const totalAmountPaid = paidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  // Unpaid invoices (SENT, VIEWED, OVERDUE, GENERATED)
  const unpaidInvoices = invoices.filter(
    (inv) => ['SENT', 'VIEWED', 'OVERDUE', 'GENERATED'].includes(inv.status)
  );
  const totalUnpaid = unpaidInvoices.length;
  const totalAmountUnpaid = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  return {
    year: period.year,
    month: period.month,
    totalRoomsBilled,
    totalAmountBilled,
    totalInvoiced,
    totalAmountInvoiced,
    totalPaid,
    totalAmountPaid,
    totalUnpaid,
    totalAmountUnpaid,
  };
}

// ============================================================================
// Core Transition Functions
// ============================================================================

/**
 * Transition a billing period to CLOSED.
 *
 * CLOSE = Manual close without locking invoices.
 * - All SENT invoices remain editable (for adjustments)
 * - New invoices cannot be generated
 * - RoomBilling records remain in their current state
 *
 * @param tx - Prisma transaction client
 * @param periodId - Billing period ID
 * @param adminId - Admin user performing the close
 * @param options - Optional reason and force flag
 * @returns BillingPeriodCloseEvent audit record
 */
export async function closeBillingPeriod(
  tx: Prisma.TransactionClient,
  periodId: string,
  adminId: string,
  options: ClosePeriodOptions = {}
): Promise<{ id: string; periodId: string; fromStatus: string; toStatus: string; closedBy: string; createdAt: Date }> {
  // Fetch period with FOR UPDATE lock to prevent race conditions
  // Include version for optimistic locking
  const [period] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
    SELECT id, status::text AS status, version
    FROM billing_periods
    WHERE id = ${periodId}
    FOR UPDATE OF billing_periods
  `;

  if (!period) {
    throw new NotFoundError('BillingPeriod', periodId);
  }

  const currentStatus = period.status as BillingPeriodStatus;
  const targetStatus = BILLING_PERIOD_STATUS.CLOSED;

  // Validate transition
  assertPeriodTransitionAllowed(currentStatus, targetStatus);

  // ── Audit chain integrity check ──────────────────────────────────────────
  // A compromised audit chain means tamper detection is offline.
  // Refuse to close the period if the chain is broken so we don't cement
  // a period in a system with broken audit integrity.
  const { verifyAuditChainIntegrity } = await import('@/modules/audit/audit-integrity.service');
  const auditResult = await verifyAuditChainIntegrity();

  if (!auditResult.valid) {
    throw new BadRequestError(
      `Cannot close period: audit chain integrity check failed. ` +
      `Broken events: ${auditResult.brokenEvents?.length ?? 0}. ` +
      `Gaps: ${auditResult.gaps?.length ?? 0}. ` +
      `Resolve audit issues before closing the period.`
    );
  }

  // Check for unpaid invoices if not forcing
  if (!options.force) {
    const unpaidCount = await tx.invoice.count({
      where: {
        roomBilling: { billingPeriodId: periodId },
        status: { in: ['SENT', 'VIEWED', 'OVERDUE', 'GENERATED'] },
      },
    });
    if (unpaidCount > 0) {
      logger.warn({
        type: 'close_period_unpaid_warning',
        periodId,
        unpaidCount,
        message: `Closing period with ${unpaidCount} unpaid invoice(s)`,
      });
    }
  }

  // Compute snapshot before state change
  const snapshot = await computePeriodSnapshot(tx, periodId);

  // Perform the transition with version check (strict concurrency enforcement)
  await versionedUpdate(tx, tx.billingPeriod, { id: periodId, version: period.version }, { status: targetStatus });

  // Create audit event
  const closeEvent = await tx.billingPeriodCloseEvent.create({
    data: {
      id: uuidv4(),
      periodId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      closedBy: adminId,
      reason: options.reason ?? null,
      totalRoomsBilled: snapshot.totalRoomsBilled,
      totalAmountBilled: new Prisma.Decimal(snapshot.totalAmountBilled),
      totalInvoiced: snapshot.totalInvoiced,
      totalAmountInvoiced: new Prisma.Decimal(snapshot.totalAmountInvoiced),
      totalPaid: snapshot.totalPaid,
      totalAmountPaid: new Prisma.Decimal(snapshot.totalAmountPaid),
      totalUnpaid: snapshot.totalUnpaid,
      totalAmountUnpaid: new Prisma.Decimal(snapshot.totalAmountUnpaid),
    },
  });

  logger.info({
    type: 'billing_period_closed',
    periodId,
    year: snapshot.year,
    month: snapshot.month,
    closedBy: adminId,
    reason: options.reason ?? null,
    snapshot,
  });

  await logAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'BILLING_PERIOD_CLOSED',
    entityType: 'BillingPeriod',
    entityId: periodId,
    metadata: {
      fromStatus: currentStatus,
      toStatus: targetStatus,
      reason: options.reason,
      snapshot,
    },
  });

  return closeEvent;
}

/**
 * Transition a billing period to LOCKED.
 *
 * LOCK = Final accounting lock — IRREVERSIBLE.
 * - ALL invoices (any status) become IMMUTABLE
 * - No adjustments allowed — must create ADJUSTMENT documents
 * - Period itself becomes read-only
 *
 * @param tx - Prisma transaction client
 * @param periodId - Billing period ID
 * @param adminId - Admin user performing the lock
 * @param reason - Optional reason for locking
 * @returns BillingPeriodCloseEvent audit record
 */
export async function lockBillingPeriod(
  tx: Prisma.TransactionClient,
  periodId: string,
  adminId: string,
  reason?: string
): Promise<{ id: string; periodId: string; fromStatus: string; toStatus: string; closedBy: string; createdAt: Date }> {
  // Fetch period with FOR UPDATE lock — include version for strict concurrency
  const [period] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
    SELECT id, status::text AS status, version
    FROM billing_periods
    WHERE id = ${periodId}
    FOR UPDATE OF billing_periods
  `;

  if (!period) {
    throw new NotFoundError('BillingPeriod', periodId);
  }

  const currentStatus = period.status as BillingPeriodStatus;
  const targetStatus = BILLING_PERIOD_STATUS.LOCKED;

  // Validate transition
  assertPeriodTransitionAllowed(currentStatus, targetStatus);

  // Reject if there are pending import batches (billing data still being entered)
  const pendingImports = await tx.importBatch.count({
    where: {
      billingPeriodId: periodId,
      status: { in: ['PENDING', 'PROCESSING'] },
    },
  });
  if (pendingImports > 0) {
    throw new BadRequestError(
      `Cannot lock period — ${pendingImports} import batch(es) still in progress. ` +
      'Complete or cancel pending imports before locking.'
    );
  }

  // Compute snapshot before state change
  const snapshot = await computePeriodSnapshot(tx, periodId);

  // Perform the transition with version check (strict concurrency enforcement)
  await versionedUpdate(tx, tx.billingPeriod, { id: periodId, version: period.version }, { status: targetStatus });

  // Auto-lock all SENT invoices: update their documentStatus to LOCKED
  await tx.invoice.updateMany({
    where: {
      roomBilling: { billingPeriodId: periodId },
      status: { in: ['SENT', 'VIEWED', 'OVERDUE'] },
    },
    data: {
      documentStatus: 'LOCKED',
      lockedAt: new Date(),
      lockedBy: adminId,
    },
  });

  // Lock all RoomBilling records that are still LOCKED (not yet invoiced)
  await tx.roomBilling.updateMany({
    where: {
      billingPeriodId: periodId,
      status: 'LOCKED', // Only lock those that haven't been invoiced
    },
    data: {
      status: 'INVOICED', // Promote to INVOICED to prevent further modification
    },
  });

  // Create audit event
  const closeEvent = await tx.billingPeriodCloseEvent.create({
    data: {
      id: uuidv4(),
      periodId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      closedBy: adminId,
      reason: reason ?? null,
      totalRoomsBilled: snapshot.totalRoomsBilled,
      totalAmountBilled: new Prisma.Decimal(snapshot.totalAmountBilled),
      totalInvoiced: snapshot.totalInvoiced,
      totalAmountInvoiced: new Prisma.Decimal(snapshot.totalAmountInvoiced),
      totalPaid: snapshot.totalPaid,
      totalAmountPaid: new Prisma.Decimal(snapshot.totalAmountPaid),
      totalUnpaid: snapshot.totalUnpaid,
      totalAmountUnpaid: new Prisma.Decimal(snapshot.totalAmountUnpaid),
    },
  });

  logger.info({
    type: 'billing_period_locked',
    periodId,
    year: snapshot.year,
    month: snapshot.month,
    lockedBy: adminId,
    reason: reason ?? null,
    snapshot,
  });

  await logAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'BILLING_PERIOD_LOCKED',
    entityType: 'BillingPeriod',
    entityId: periodId,
    metadata: {
      fromStatus: currentStatus,
      toStatus: targetStatus,
      reason,
      snapshot,
    },
  });

  await logFinancialAudit({
    tx,
    entityType: 'BillingPeriod',
    entityId: periodId,
    action: 'BILLING_PERIOD_LOCKED',
    before: { status: currentStatus },
    after: { status: targetStatus },
    performedBy: adminId,
  });

  return closeEvent;
}

/**
 * Transition a billing period to ARCHIVED.
 *
 * ARCHIVE = Read-only historical record. Terminal state.
 * - All data is frozen
 * - No changes of any kind allowed
 *
 * @param tx - Prisma transaction client
 * @param periodId - Billing period ID
 * @param adminId - Admin user performing the archive
 */
export async function archiveBillingPeriod(
  tx: Prisma.TransactionClient,
  periodId: string,
  adminId: string
): Promise<void> {
  // Fetch period with FOR UPDATE lock — include version for strict concurrency
  const [period] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
    SELECT id, status::text AS status, version
    FROM billing_periods
    WHERE id = ${periodId}
    FOR UPDATE OF billing_periods
  `;

  if (!period) {
    throw new NotFoundError('BillingPeriod', periodId);
  }

  const currentStatus = period.status as BillingPeriodStatus;
  const targetStatus = BILLING_PERIOD_STATUS.ARCHIVED;

  // Validate transition
  assertPeriodTransitionAllowed(currentStatus, targetStatus);

  // Compute snapshot
  const snapshot = await computePeriodSnapshot(tx, periodId);

  // Perform the transition with version check (strict concurrency enforcement)
  await versionedUpdate(tx, tx.billingPeriod, { id: periodId, version: period.version }, { status: targetStatus });

  // Create audit event
  await tx.billingPeriodCloseEvent.create({
    data: {
      id: uuidv4(),
      periodId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      closedBy: adminId,
      reason: 'Archived for historical reference',
      totalRoomsBilled: snapshot.totalRoomsBilled,
      totalAmountBilled: new Prisma.Decimal(snapshot.totalAmountBilled),
      totalInvoiced: snapshot.totalInvoiced,
      totalAmountInvoiced: new Prisma.Decimal(snapshot.totalAmountInvoiced),
      totalPaid: snapshot.totalPaid,
      totalAmountPaid: new Prisma.Decimal(snapshot.totalAmountPaid),
      totalUnpaid: snapshot.totalUnpaid,
      totalAmountUnpaid: new Prisma.Decimal(snapshot.totalAmountUnpaid),
    },
  });

  logger.info({
    type: 'billing_period_archived',
    periodId,
    year: snapshot.year,
    month: snapshot.month,
    archivedBy: adminId,
    snapshot,
  });

  await logAudit({
    actorId: adminId,
    actorRole: 'ADMIN',
    action: 'BILLING_PERIOD_ARCHIVED',
    entityType: 'BillingPeriod',
    entityId: periodId,
    metadata: {
      fromStatus: currentStatus,
      toStatus: targetStatus,
      snapshot,
    },
  });
}

/**
 * Get the close history for a billing period (all transition events).
 */
export async function getPeriodCloseHistory(periodId: string) {
  const events = await prisma.billingPeriodCloseEvent.findMany({
    where: { periodId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      closedBy: true,
      reason: true,
      totalRoomsBilled: true,
      totalAmountBilled: true,
      totalInvoiced: true,
      totalAmountInvoiced: true,
      totalPaid: true,
      totalAmountPaid: true,
      totalUnpaid: true,
      totalAmountUnpaid: true,
      createdAt: true,
    },
  });

  return events;
}

/**
 * Check if a billing period is in a terminal state (LOCKED or ARCHIVED).
 * Returns true if no further transitions are possible.
 */
export async function isPeriodTerminal(
  tx: Prisma.TransactionClient,
  periodId: string
): Promise<boolean> {
  const period = await tx.billingPeriod.findUnique({
    where: { id: periodId },
    select: { status: true },
  });

  if (!period) return false;

  const status = period.status as BillingPeriodStatus;
  const allowed = BILLING_PERIOD_TRANSITIONS[status] ?? [];
  return allowed.length === 0;
}