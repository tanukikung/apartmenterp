/**
 * Late Fee Job — runs as a daily cron job.
 * For each OVERDUE invoice, calculates late fee based on BillingRule penaltyPerDay.
 *
 * Idempotency: only invoices with lateFeeAppliedAt IS NULL are selected and
 * updated in a single atomic operation. A second concurrent or overlapping run
 * will find 0 rows matching the guard and skip silently — no double charge.
 */

import { prisma } from '@/lib';
import { logger } from '@/lib/utils/logger';

// How many days a late fee calculation spans (used only in comments; actual
// computation is driven by the invoice's dueDate and the rule's grace period)
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type LateFeeJobResult = {
  processed: number;
  updated: number;
  totalFees: number;
  skipped: number;
  errors: string[];
};

export async function runLateFeeJob(): Promise<LateFeeJobResult> {
  const result: LateFeeJobResult = {
    processed: 0,
    updated: 0,
    totalFees: 0,
    skipped: 0,
    errors: [],
  };

  const now = new Date();

  const overdueInvoices = await prisma.invoice.findMany({
    where: { status: 'OVERDUE', lateFeeAppliedAt: null },
    include: {
      roomBilling: {
        include: { effectiveRule: true },
      },
    },
  });

  for (const invoice of overdueInvoices) {
    result.processed++;
    const rule = invoice.roomBilling?.effectiveRule;

    if (!rule) {
      result.skipped++;
      continue;
    }

    const penaltyPerDay = Number(rule.penaltyPerDay ?? 0);
    const maxPenalty = Number(rule.maxPenalty ?? 0);
    const gracePeriodDays = (rule as { gracePeriodDays?: number }).gracePeriodDays ?? 0;

    if (penaltyPerDay <= 0) {
      result.skipped++;
      continue;
    }

    const dueDate = new Date(invoice.dueDate);
    // Apply grace period
    const effectiveDueDate = new Date(dueDate);
    effectiveDueDate.setDate(effectiveDueDate.getDate() + gracePeriodDays);

    const daysOverdue = Math.floor(
      (now.getTime() - effectiveDueDate.getTime()) / MS_PER_DAY
    );

    if (daysOverdue <= 0) {
      result.skipped++;
      continue;
    }

    const chargeableDays = Math.max(0, daysOverdue - gracePeriodDays);
    const invoiceTotal = Number(invoice.totalAmount);
    const lateFee = penaltyPerDay > 0
      ? Math.min(chargeableDays * penaltyPerDay * invoiceTotal, maxPenalty)
      : 0;

    try {
      // Atomic idempotency guard: only update if lateFeeAppliedAt is still NULL.
      // If a concurrent or overlapping run already set it, 0 rows are affected
      // and we skip silently.
      const rowsAffected = await prisma.$executeRaw`
        UPDATE "invoices"
        SET "lateFeeAmount" = ${lateFee}::decimal,
            "lateFeeAppliedAt" = ${now}::timestamptz
        WHERE id = ${invoice.id}::uuid
          AND "lateFeeAppliedAt" IS NULL
      `;
      if (rowsAffected === 0) {
        result.skipped++;
        continue;
      }
      result.updated++;
      result.totalFees += Number(lateFee);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Invoice ${invoice.id}: ${msg}`);
    }
  }

  logger.info({
    type: 'late_fee_job',
    processed: result.processed,
    updated: result.updated,
    totalFees: result.totalFees,
    skipped: result.skipped,
    errors: result.errors.length,
  });

  return result;
}