import type { Prisma } from '@prisma/client';

export async function ensureOtherBillingType(tx?: Prisma.TransactionClient) {
  const { prisma: shared } = await import('@/lib/db/client');
  const db = (tx || shared) as unknown as Prisma.TransactionClient & typeof shared;
  const existing = await db.billingItemType.findUnique({ where: { code: 'OTHER' } as any });
  if (existing) return existing;
  return db.billingItemType.create({
    data: {
      code: 'OTHER',
      name: 'Other',
      description: 'Misc',
      isRecurring: false,
      defaultAmount: 0,
    } as any,
  });
}

export async function createBillingRecordForRoom(
  roomId: string,
  overrides: Partial<{ year: number; month: number } & Record<string, unknown>> = {},
) {
  const { getBillingService } = await import('@/modules/billing/billing.service');
  const svc = getBillingService();
  const now = new Date();
  const year = overrides.year ?? now.getFullYear();
  const month = overrides.month ?? now.getMonth() + 1;
  return svc.createBillingRecord({ roomId, year, month } as any);
}

export async function addOtherItem(
  billingRecordId: string,
  amount: number,
  description: string = 'Other charge'
) {
  await ensureOtherBillingType();
  const { prisma: shared } = await import('@/lib/db/client');
  const db = shared as unknown as Prisma.TransactionClient & typeof shared;
  return db.billingItem.create({
    data: {
      billingRecordId,
      itemTypeId: (await db.billingItemType.findUnique({ where: { code: 'OTHER' } as any }))!.id,
      description,
      quantity: 1,
      unitPrice: amount,
      amount,
      isEditable: true,
    } as any,
  });
}
