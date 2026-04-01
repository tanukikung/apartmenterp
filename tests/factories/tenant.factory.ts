import type { Prisma } from '@prisma/client';

type TenantOverrides = Partial<{
  firstName: string;
  lastName: string;
  phone: string;
  lineUserId: string | null;
}>;

export async function createTenant(
  overrides: TenantOverrides = {},
  tx?: Prisma.TransactionClient
) {
  const { prisma: shared } = await import('@/lib/db/client');
  const db = (tx || shared) as unknown as Prisma.TransactionClient & typeof shared;
  const idx = Math.floor(Math.random() * 100000);
  const data = {
    firstName: overrides.firstName ?? `John${idx}`,
    lastName: overrides.lastName ?? `Doe${idx}`,
    phone: overrides.phone ?? `0999${String(idx).padStart(6, '0')}`,
    lineUserId: overrides.lineUserId ?? null,
  } as any;
  return db.tenant.create({ data });
}
