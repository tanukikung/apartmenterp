/**
 * Invoice generation idempotency — wraps the generate invoice flow.
 * Uses the Idempotency-Key header to prevent duplicate invoice generation.
 */

import { prisma } from '@/lib/db/client';
import { withIdempotency } from '@/lib/idempotency';

interface GenerateInvoicesResult {
  periodId: string;
  generated: number;
  skipped: number;
  invoices: Array<{ id: string; roomNo: string }>;
}

export async function generateInvoicesIdempotent(
  periodId: string,
  idempotencyKey: string | null,
  fn: () => Promise<GenerateInvoicesResult>
): Promise<GenerateInvoicesResult & { cached?: boolean }> {
  if (!idempotencyKey) {
    const result = await fn();
    return result;
  }

  const cached = await prisma.idempotencyRecord.findUnique({ where: { key: idempotencyKey } });
  if (cached?.result) {
    const parsed = cached.result as unknown as GenerateInvoicesResult;
    return { ...parsed, cached: true };
  }

  const result = await fn();

  await prisma.idempotencyRecord.upsert({
    where: { key: idempotencyKey },
    create: { key: idempotencyKey, resourceType: 'invoice_generation', result: result as never },
    update: { result: result as never },
  });

  return { ...result, cached: false };
}