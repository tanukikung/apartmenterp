/**
 * Optimistic Locking Utilities
 *
 * Provides version-based conflict detection for critical operations.
 * When two concurrent admin operations try to modify the same entity,
 * the second one receives a ConflictError with details about the version mismatch.
 *
 * Usage:
 *   const result = await tx.billingPeriod.updateMany({
 *     where: { id: periodId, version: expectedVersion },
 *     data: { status: newStatus, version: expectedVersion + 1 }
 *   });
 *   if (result.count === 0) {
 *     throw new OptimisticLockError('BillingPeriod', periodId, expectedVersion, currentVersion);
 *   }
 */

import type { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '@/lib/utils/errors';

// Re-export ConflictError for convenience
export { ConflictError } from '@/lib/utils/errors';

/**
 * Thrown when a concurrent modification is detected via version mismatch.
 * Extends ConflictError (HTTP 409) so API routes return the correct status code.
 */
export class OptimisticLockError extends ConflictError {
  public readonly entityType: string;
  public readonly entityId: string;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(
    entityType: string,
    entityId: string,
    expectedVersion: number,
    actualVersion: number
  ) {
    super(
      `${entityType} ${entityId} was modified by another operation. ` +
      `Expected version ${expectedVersion}, current version ${actualVersion}. ` +
      `Please refresh and try again.`
    );
    this.name = 'OptimisticLockError';
    this.entityType = entityType;
    this.entityId = entityId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Options for optimistic locking operations.
 */
export interface OptimisticLockOptions {
  /** Entity type name for error messages (e.g., 'BillingPeriod') */
  entityType: string;
  /** Entity ID for error messages */
  entityId: string;
  /** The version the caller expects */
  expectedVersion: number;
}

/**
 * Result of an optimistic lock update attempt.
 */
export interface OptimisticLockResult {
  /** True if the update succeeded (version matched) */
  success: boolean;
  /** The new version number if successful */
  newVersion?: number;
  /** The actual current version if conflict detected */
  actualVersion?: number;
}

/**
 * Attempt an atomic update with optimistic locking.
 *
 * Uses UPDATE ... WHERE version = expectedVersion to detect concurrent modifications.
 * If another transaction modified the row between read and write, count === 0.
 *
 * @param tx - Prisma transaction client
 * @param table - Table name (e.g., 'billing_periods')
 * @param id - Entity ID
 * @param data - Data to update (excluding version)
 * @param options - Optimistic lock options (entityType, entityId, expectedVersion)
 * @returns OptimisticLockResult with success=true if update succeeded
 * @throws OptimisticLockError when version mismatch detected
 */
export async function withOptimisticLock<T extends Record<string, unknown>>(
  tx: Prisma.TransactionClient,
  table: string,
  id: string,
  data: T,
  options: OptimisticLockOptions
): Promise<OptimisticLockResult> {
  const { entityType, entityId, expectedVersion } = options;
  const newVersion = expectedVersion + 1;

  // Build the SET clause dynamically to avoid SQL injection
  // All keys are controlled by the caller (field names from Prisma schema)
  const _setClause = Object.keys(data)
    .map((key) => `"${key}" = $\{${key}}`)
    .concat([`"version" = ${newVersion}`])
    .join(', ');

  const dataWithVersion = { ...data, version: newVersion };

  const result = await (tx as unknown as {
    $executeRaw: (strings: TemplateStringsArray, ...args: unknown[]) => Promise<number>;
  }).$executeRaw`UPDATE "${table}" SET ${tx as unknown as Record<string, unknown>} ${dataWithVersion} WHERE id = ${id} AND version = ${expectedVersion}`;

  if (result === 0) {
    // Fetch current version to provide helpful error message
    const rows = await (tx as unknown as {
      $queryRaw: (strings: TemplateStringsArray, ...args: unknown[]) => Promise<Array<{ version: number }>>;
    }).$queryRaw`SELECT version FROM "${table}" WHERE id = ${id}`;

    const actualVersion = rows[0]?.version ?? 0;
    throw new OptimisticLockError(entityType, entityId, expectedVersion, actualVersion);
  }

  return { success: true, newVersion };
}

/**
 * Assert that an entity's version matches the expected version.
 * Throws OptimisticLockError if mismatch.
 *
 * Use this after fetching an entity to verify it hasn't been modified
 * since it was read.
 *
 * @param entity - The entity to check (must have `version` field)
 * @param expectedVersion - The version the caller expects
 * @param entityType - Human-readable type name for error messages
 * @param entityId - The entity ID for error messages
 * @throws OptimisticLockError if entity is null or version mismatches
 */
export function assertVersion(
  entity: { version: number } | null,
  expectedVersion: number,
  entityType: string,
  entityId: string
): void {
  if (!entity) {
    throw new NotFoundError(entityType, entityId);
  }
  if (entity.version !== expectedVersion) {
    throw new OptimisticLockError(entityType, entityId, expectedVersion, entity.version);
  }
}

/**
 * Acquire a row-level lock using SELECT ... FOR UPDATE.
 *
 * Use this for operations that need to read-then-write atomically,
 * where optimistic locking isn't sufficient (e.g., complex conditional logic).
 *
 * @param tx - Prisma transaction client
 * @param table - Table name
 * @param id - Entity ID to lock
 * @returns The locked row
 * @throws NotFoundError if row doesn't exist
 */
export async function selectForUpdate<T extends Record<string, unknown>>(
  tx: Prisma.TransactionClient,
  table: string,
  id: string
): Promise<T> {
  const [row] = await (tx as unknown as {
    $queryRaw: <R>(strings: TemplateStringsArray, ...args: unknown[]) => Promise<R[]>;
  }).$queryRaw<T>`SELECT * FROM "${table}" WHERE id = ${id} FOR UPDATE`;

  if (!row) {
    throw new NotFoundError(table, id);
  }

  return row;
}

/**
 * Update with optimistic lock on BillingPeriod.
 * Use this for billing period status transitions (OPEN -> LOCKED -> CLOSED).
 *
 * @param tx - Prisma transaction client
 * @param periodId - Billing period ID
 * @param data - Update data (status, etc.)
 * @param expectedVersion - Expected version for conflict detection
 * @throws OptimisticLockError if concurrent modification detected
 */
export async function updateBillingPeriodWithLock(
  tx: Prisma.TransactionClient,
  periodId: string,
  data: { status?: string; note?: string },
  expectedVersion: number
): Promise<void> {
  const result = await tx.billingPeriod.updateMany({
    where: { id: periodId, version: expectedVersion },
    data: { status: data.status as 'DRAFT' | 'OPEN' | 'CLOSED' | 'LOCKED' | 'ARCHIVED', note: data.note, version: expectedVersion + 1 },
  });

  if (result.count === 0) {
    // Fetch current version for error message
    const current = await tx.billingPeriod.findUnique({
      where: { id: periodId },
      select: { version: true },
    });
    throw new OptimisticLockError(
      'BillingPeriod',
      periodId,
      expectedVersion,
      current?.version ?? 0
    );
  }
}

/**
 * Update with optimistic lock on RoomBilling.
 * Use this for room billing recalculations and status changes.
 *
 * @param tx - Prisma transaction client
 * @param billingId - Room billing ID
 * @param data - Update data
 * @param expectedVersion - Expected version for conflict detection
 * @throws OptimisticLockError if concurrent modification detected
 */
export async function updateRoomBillingWithLock(
  tx: Prisma.TransactionClient,
  billingId: string,
  data: {
    status?: string;
    totalDue?: number;
    waterUnits?: number;
    electricUnits?: number;
    [key: string]: unknown;
  },
  expectedVersion: number
): Promise<void> {
  const result = await tx.roomBilling.updateMany({
    where: { id: billingId, version: expectedVersion },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { status: data.status as any, totalDue: data.totalDue, waterUnits: data.waterUnits, electricUnits: data.electricUnits, version: expectedVersion + 1 },
  });

  if (result.count === 0) {
    const current = await tx.roomBilling.findUnique({
      where: { id: billingId },
      select: { version: true },
    });
    throw new OptimisticLockError(
      'RoomBilling',
      billingId,
      expectedVersion,
      current?.version ?? 0
    );
  }
}

/**
 * Update with optimistic lock on Invoice.
 * Use this for invoice status transitions.
 *
 * @param tx - Prisma transaction client
 * @param invoiceId - Invoice ID
 * @param data - Update data (status, etc.)
 * @param expectedVersion - Expected version for conflict detection
 * @throws OptimisticLockError if concurrent modification detected
 */
export async function updateInvoiceWithLock(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  data: { status?: string; [key: string]: unknown },
  expectedVersion: number
): Promise<void> {
  const result = await tx.invoice.updateMany({
    where: { id: invoiceId, version: expectedVersion },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { status: data.status as any, version: expectedVersion + 1 },
  });

  if (result.count === 0) {
    const current = await tx.invoice.findUnique({
      where: { id: invoiceId },
      select: { version: true },
    });
    throw new OptimisticLockError(
      'Invoice',
      invoiceId,
      expectedVersion,
      current?.version ?? 0
    );
  }
}
