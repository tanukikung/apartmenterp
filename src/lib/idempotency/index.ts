/**
 * Idempotency system — prevents duplicate processing of the same request.
 *
 * Usage:
 *   const result = await withIdempotency('invoice-generated', key, async () => generateInvoice(...));
 */

import { prisma } from '@/lib/db/client';

interface IdempotencyResult<T> {
  isNew: boolean;
  result: T;
}

/**
 * Execute a function with idempotency protection.
 * If a record with the given key already exists, return the cached result.
 * Otherwise, run the function and cache its result.
 */
export async function withIdempotency<T>(
  resourceType: string,
  key: string,
  fn: () => Promise<T>
): Promise<IdempotencyResult<T>> {
  const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });
  if (existing && existing.result !== null) {
    return { isNew: false, result: existing.result as unknown as T };
  }

  const result = await fn();

  await prisma.idempotencyRecord.upsert({
    where: { key },
    create: { key, resourceType, result: result as never },
    update: { result: result as never },
  });

  return { isNew: true, result };
}

/**
 * Check if an idempotency key has been used.
 */
export async function getIdempotencyRecord(key: string) {
  return prisma.idempotencyRecord.findUnique({ where: { key } });
}

/**
 * Clear an idempotency record (for retry scenarios).
 */
export async function clearIdempotencyRecord(key: string) {
  return prisma.idempotencyRecord.delete({ where: { key } }).catch(() => undefined);
}