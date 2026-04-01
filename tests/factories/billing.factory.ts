import type { Prisma } from '@prisma/client';

// BillingItemType, BillingItem, and BillingRecord models were removed in the
// new schema (replaced by RoomBilling flat rows).  These helpers are kept as
// stubs so existing test files that import them don't break at compile time.

export async function ensureOtherBillingType(_tx?: Prisma.TransactionClient) {
  // No-op stub — BillingItemType model removed.
  return { id: 'stub-type-other', code: 'OTHER', name: 'Other' };
}

export async function createBillingRecordForRoom(
  roomId: string,
  overrides: Partial<{ year: number; month: number } & Record<string, unknown>> = {},
) {
  // BillingRecord model removed.  Stub returns a minimal object.
  const now = new Date();
  const year = (overrides.year as number | undefined) ?? now.getFullYear();
  const month = (overrides.month as number | undefined) ?? now.getMonth() + 1;
  return {
    id: `stub-rb-${roomId}-${year}-${month}`,
    roomNo: roomId,
    billingPeriodId: `stub-period-${year}-${month}`,
    year,
    month,
    totalDue: 0,
    status: 'DRAFT' as const,
  };
}

export async function addOtherItem(
  _billingRecordId: string,
  _amount: number,
  _description: string = 'Other charge',
) {
  // No-op stub — BillingItem model removed.
  return { id: 'stub-item' };
}
