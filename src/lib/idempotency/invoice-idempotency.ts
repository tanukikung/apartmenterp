/**
 * Invoice generation idempotency — wraps the generate invoice flow.
 * Uses the Idempotency-Key header to prevent duplicate invoice generation.
 */

import { prisma } from '@/lib/db/client';

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
  if (cached?.response) {
    const parsed = cached.response as unknown as GenerateInvoicesResult;
    return { ...parsed, cached: true };
  }

  const result = await fn();

  await prisma.idempotencyRecord.upsert({
    where: { key: idempotencyKey },
    create: { key: idempotencyKey, resourceType: 'invoice_generation', response: result as never },
    update: { response: result as never },
  });

  return { ...result, cached: false };
}