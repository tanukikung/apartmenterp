/**
 * Late Fee Job — runs as a daily cron job.
 * For each OVERDUE invoice, calculates late fee based on BillingRule penaltyPerDay.
 */

import { prisma } from '@/lib';
import { logger } from '@/lib/utils/logger';
import { calculateLateFee } from '@/modules/reminders';

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
    where: { status: 'OVERDUE' },
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
      (now.getTime() - effectiveDueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysOverdue <= 0) {
      result.skipped++;
      continue;
    }

    const lateFee = calculateLateFee(daysOverdue, penaltyPerDay, maxPenalty);

    try {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          lateFeeAmount: lateFee,
          lateFeeAppliedAt: now,
        },
      });
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