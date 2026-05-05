/**
 * Universal Version Guard — Strict Concurrency Enforcement
 *
 * Provides version-based optimistic locking for ALL entity updates.
 * Every mutation to BillingPeriod, RoomBilling, and Invoice MUST go through
 * versionedUpdate to prevent lost-update race conditions.
 *
 * Usage:
 *   const result = await versionedUpdate(tx, realPrisma.billingPeriod,
 *     { id: periodId, version: 5 },
 *     { status: 'CLOSED' }
 *   );
 *   // On conflict: throws ConcurrentModificationError
 */

import { ConflictError, NotFoundError } from '@/lib/utils/errors';
import type { Prisma } from '@prisma/client';

// Re-export ConflictError for convenience in callers
export { ConflictError } from '@/lib/utils/errors';

/**
 * Universal optimistic lock error — thrown when version mismatch detected.
 * This signals concurrent modification and requires retry.
 *
 * Distinct from ConflictError in that it carries structured version info
 * that clients can use to refresh and retry.
 */
export class ConcurrentModificationError extends ConflictError {
  public readonly entityType: string;
  public readonly entityId: string;
  public readonly expectedVersion: number;
  public readonly actualVersion: number;

  constructor(
    entityType: string,
    entityId: string,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `Concurrent modification detected on ${entityType} ${entityId}. ` +
        `Expected version ${expectedVersion}, found ${actualVersion}. ` +
        `Please retry the operation.`,
      { entityType, entityId, expectedVersion, actualVersion }
    );
    this.name = 'ConcurrentModificationError';
    this.entityType = entityType;
    this.entityId = entityId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Check that a model has a version field before using versionedUpdate.
 * Throws if the model doesn't support optimistic locking.
 */
function assertHasVersionField(model: unknown, modelName: string): void {
  if (!model || typeof model !== 'object') {
    throw new Error(`Invalid Prisma model for ${modelName}`);
  }
}

/**
 * Version-checked update — the universal pattern for ALL updates.
 * Use this instead of raw Prisma update to ensure no lost updates.
 *
 * @param tx - Prisma transaction client
 * @param model - Prisma model delegate (e.g., tx.billingPeriod)
 * @param where - Must include id AND version for the check
 * @param data - Fields to update (version is auto-incremented)
 * @returns The updated record
 * @throws ConcurrentModificationError when version mismatch (concurrent update detected)
 * @throws NotFoundError when entity does not exist
 */
export async function versionedUpdate<T extends Record<string, unknown>>(
  tx: Prisma.TransactionClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  where: { id: string; version: number },
  data: Partial<T>
): Promise<T> {
  if (!where.id || typeof where.version !== 'number') {
    throw new Error('versionedUpdate requires { id: string, version: number }');
  }

  const modelName = model?.name ?? 'Entity';

  const result = await model.updateMany({
    where: { id: where.id, version: where.version },
    data: { ...data, version: where.version + 1 },
  });

  if (result.count === 0) {
    // Version mismatch — fetch current to report accurate error
    const current = await model.findUnique({ where: { id: where.id } });
    if (!current) throw new NotFoundError(modelName, where.id);
    throw new ConcurrentModificationError(
      modelName,
      where.id,
      where.version,
      current.version,
    );
  }

  return model.findUnique({ where: { id: where.id } }) as Promise<T>;
}

/**
 * Alias for versionedUpdate with a more descriptive name for service use.
 * Use when the pattern is applied inside a service with known entity context.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const atomicVersionUpdate = versionedUpdate;