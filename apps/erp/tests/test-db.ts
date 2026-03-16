import type { Prisma } from '@prisma/client';

const ROLLBACK = '__TEST_TX_ROLLBACK__';

export async function withTestTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  let result!: T;
  try {
    const { prisma } = await import('@/lib/db/client');
    await prisma.$transaction(async (tx) => {
      result = await fn(tx);
      // force rollback
      throw new Error(ROLLBACK);
    });
  } catch (err) {
    if (err instanceof Error && err.message === ROLLBACK) {
      // expected rollback
      return result;
    }
    throw err;
  }
  // Should never get here
  return result;
}
