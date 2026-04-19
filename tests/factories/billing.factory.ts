import type { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test factories for the current schema:
 *   BillingPeriod (year, month, status) — one per cycle, unique on (year, month)
 *   RoomBilling   (one row per room per period; flat charges, no line items)
 *
 * Earlier versions of these factories targeted a removed BillingRecord model
 * with separate BillingItem rows — those stubs returned synthetic IDs that
 * never matched a real DB row. This file replaces those stubs with helpers
 * that perform actual Prisma writes.
 */

async function getDb(tx?: Prisma.TransactionClient) {
  const { prisma } = await import('@/lib/db/client');
  return (tx ?? prisma) as any;
}

export async function ensureBillingPeriod(
  year: number,
  month: number,
  overrides: Partial<{ status: string; dueDay: number }> = {},
  tx?: Prisma.TransactionClient
) {
  const db = await getDb(tx);
  return db.billingPeriod.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: {
      id: uuidv4(),
      year,
      month,
      status: overrides.status ?? 'OPEN',
      dueDay: overrides.dueDay ?? 25,
    },
  });
}

/**
 * Compatibility shim — earlier tests called ensureOtherBillingType().
 * BillingItemType was removed; return a stable stub so callers keep working.
 */
export async function ensureOtherBillingType(_tx?: Prisma.TransactionClient) {
  return { id: 'stub-type-other', code: 'OTHER', name: 'Other' };
}

/**
 * Create a RoomBilling row for the given room. Defaults add up to a non-zero
 * totalDue so downstream invoice generation has a meaningful amount.
 *
 * @param roomNo   Room PK string
 * @param overrides  year/month/status/totalDue/charges
 */
export async function createBillingRecordForRoom(
  roomNo: string,
  overrides: Partial<{
    year: number;
    month: number;
    periodStatus: string;
    billingStatus: string;
    rentAmount: number;
    waterTotal: number;
    electricTotal: number;
    otherFee: number;
    totalDue: number;
  }> = {},
  tx?: Prisma.TransactionClient
) {
  const db = await getDb(tx);
  const now = new Date();
  const year = overrides.year ?? now.getFullYear();
  const month = overrides.month ?? now.getMonth() + 1;

  const period = await ensureBillingPeriod(
    year,
    month,
    { status: overrides.periodStatus ?? 'OPEN' },
    tx
  );

  const rentAmount = overrides.rentAmount ?? 5000;
  const waterTotal = overrides.waterTotal ?? 0;
  const electricTotal = overrides.electricTotal ?? 0;
  const otherFee = overrides.otherFee ?? 0;
  const totalDue =
    overrides.totalDue ?? rentAmount + waterTotal + electricTotal + otherFee;

  return db.roomBilling.create({
    data: {
      id: uuidv4(),
      billingPeriodId: period.id,
      roomNo,
      recvAccountId: 'ACC_F1',
      ruleCode: 'STANDARD',
      rentAmount,
      waterMode: 'NORMAL',
      waterUnits: 0,
      waterUsageCharge: 0,
      waterServiceFee: 0,
      waterTotal,
      electricMode: 'NORMAL',
      electricUnits: 0,
      electricUsageCharge: 0,
      electricServiceFee: 0,
      electricTotal,
      furnitureFee: 0,
      otherFee,
      totalDue,
      status: overrides.billingStatus ?? 'DRAFT',
      calculatedAt: new Date(),
    },
  });
}

/**
 * Compatibility shim — earlier tests called addOtherItem(billingId, amount).
 * In the flat RoomBilling model we just bump otherFee + totalDue.
 */
export async function addOtherItem(
  roomBillingId: string,
  amount: number,
  _description: string = 'Other charge',
  tx?: Prisma.TransactionClient
) {
  const db = await getDb(tx);
  const current = await db.roomBilling.findUnique({ where: { id: roomBillingId } });
  if (!current) {
    throw new Error(`addOtherItem: roomBilling ${roomBillingId} not found`);
  }
  const newOther = Number(current.otherFee) + amount;
  const newTotal = Number(current.totalDue) + amount;
  await db.roomBilling.update({
    where: { id: roomBillingId },
    data: { otherFee: newOther, totalDue: newTotal },
  });
  return { id: `item-${roomBillingId}-${Date.now()}`, amount };
}

/**
 * Lock a RoomBilling + its parent BillingPeriod so an invoice can be generated.
 */
export async function lockBilling(
  roomBillingId: string,
  tx?: Prisma.TransactionClient
) {
  const db = await getDb(tx);
  const rb = await db.roomBilling.update({
    where: { id: roomBillingId },
    data: { status: 'LOCKED' },
  });
  await db.billingPeriod.update({
    where: { id: rb.billingPeriodId },
    data: { status: 'LOCKED' },
  });
  return rb;
}
