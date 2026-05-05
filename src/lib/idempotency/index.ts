/**
 * Idempotency system — prevents duplicate processing of the same request.
 *
 * All DB operations are wrapped in a SERIALIZABLE transaction so that
 * concurrent requests with the same key are serialized at the DB level.
 * No read-before-write TOCTOU race exists.
 *
 * Usage:
 *   const { result } = await withIdempotency(req, 'invoice_send:${invoiceId}', async (tx) => {
 *     // tx is the Prisma transaction client — all DB work here is protected
 *     return sendInvoice(tx, invoiceId);
 *   });
 */

import { prisma } from '@/lib/db/client';
import type { PrismaClient } from '@prisma/client';
import { ConflictError } from '@/lib/utils/errors';

interface IdempotencyResult<T> {
  isNew: boolean;
  result: T;
}

/**
 * Execute a function with idempotency protection.
 *
 * Concurrent calls with the same key are serialized by the DB's
 * serializable isolation level. The first call to commit wins;
 * others receive the cached response as a ConflictError (409).
 */
export async function withIdempotency<T>(
  req: Request,
  key: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (tx: PrismaClient) => Promise<T>
): Promise<IdempotencyResult<T>> {
  if (!key || key.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await fn(prisma as any);
    return { isNew: true, result };
  }

  return prisma.$transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx) => {
      // Use findUnique to check if a record already exists.
      // Concurrent upserts on the same key are serialized by the DB.
      const existing = await tx.idempotencyRecord.findUnique({ where: { key } });

      if (existing) {
        if (existing.response !== null) {
          // Already computed — return cached response
          return { isNew: false, result: existing.response as unknown as T };
        }
        // Record exists but response is null — another request is in progress.
        // Throw ConflictError to force the client to retry.
        throw new ConflictError('Idempotency key is being processed by another request');
      }

      // First request — run the function
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await fn(tx as any);

      // Cache the result (response field)
      await tx.idempotencyRecord.create({
        data: {
          key,
          resourceType: req.url,
          response: result as never,
        },
      });

      return { isNew: true, result };
    },
    { isolationLevel: 'Serializable', timeout: 10_000 }
  );
}

/**
 * Check if an idempotency key has been used.
 */
export async function getIdempotencyRecord(key: string) {
  return prisma.idempotencyRecord.findUnique({ where: { key } });
}

/**
 * Clear an idempotency record (for retry scenarios after known failure).
 */
export async function clearIdempotencyRecord(key: string) {
  return prisma.idempotencyRecord.delete({ where: { key } }).catch(() => undefined);
}