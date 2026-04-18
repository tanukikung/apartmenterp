/**
 * Enhanced Reminder Service — configurable reminder schedules + late fee calculation.
 */

import { prisma } from '@/lib/db/client';
import { EventTypes } from '@/lib/events';
import { logger } from '@/lib/utils/logger';

import { v4 as uuidv4 } from 'uuid';


// Default day offsets for fallback reminder logic (when no ReminderConfig records exist)
// Can be overridden via environment variables:
//   DEFAULT_DUE_SOON_DAYS  — days before due date for "due soon" reminders (default: 3)
//   DEFAULT_OVERDUE_DAYS   — days after due date for "overdue" reminders (default: 3)
const DEFAULT_DUE_SOON_DAYS = parseInt(process.env.DEFAULT_DUE_SOON_DAYS ?? '3', 10);
const DEFAULT_OVERDUE_DAYS = parseInt(process.env.DEFAULT_OVERDUE_DAYS ?? '3', 10);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Calculate late fee for an invoice based on its BillingRule.
 * fee = min(daysOverdue * penaltyPerDay, maxPenalty)
 */
export function calculateLateFee(
  daysOverdue: number,
  penaltyPerDay: number,
  maxPenalty: number
): number {
  if (daysOverdue <= 0 || penaltyPerDay <= 0) return 0;
  const fee = daysOverdue * penaltyPerDay;
  return maxPenalty > 0 ? Math.min(fee, maxPenalty) : fee;
}

/**
 * Get the active ReminderConfig for a given periodDays (e.g. -3 = 3 days overdue).
 */
export async function getActiveReminderConfig(periodDays: number) {
  return prisma.reminderConfig.findFirst({
    where: {
      periodDays,
      isActive: true,
    },
  });
}

export class ReminderService {
  /**
   * Run the daily reminder job — reads ReminderConfig to determine which
   * reminders to send, then creates outbox events.
   */
  async runDaily(today: Date = new Date()): Promise<{
    scheduled: number;
    dueSoon: number;
    dueToday: number;
    overdue: number;
    errors: string[];
  }> {
    const base = startOfDay(today);
    const errors: string[] = [];

    // Fetch all active reminder configs
    const configs = await prisma.reminderConfig.findMany({
      where: { isActive: true },
      orderBy: { periodDays: 'asc' },
    });

    if (configs.length === 0) {
      // Fall back to default behavior
      return this.runDailyDefault(today);
    }

    const _now = new Date();
    const openStatuses = ['GENERATED', 'SENT', 'VIEWED'] as const;

    let scheduled = 0;

    for (const config of configs) {
      const days = config.periodDays;
      let invoices;

      if (days > 0) {
        // Pre-due reminder: N days before dueDate
        const targetDate = new Date(base);
        targetDate.setDate(targetDate.getDate() + days);
        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        invoices = await prisma.invoice.findMany({
          where: {
            status: { in: [...openStatuses] },
            dueDate: { gte: start, lte: end },
          },
          select: { id: true, dueDate: true, roomNo: true },
        });
      } else if (days < 0) {
        // Overdue reminder: N days after dueDate (negative days = overdue)
        const targetDate = new Date(base);
        targetDate.setDate(targetDate.getDate() + days); // days is negative
        const start = startOfDay(targetDate);
        const end = endOfDay(targetDate);

        invoices = await prisma.invoice.findMany({
          where: {
            status: { in: ['SENT', 'VIEWED', 'OVERDUE'] },
            dueDate: { gte: start, lte: end },
          },
          select: { id: true, dueDate: true, roomNo: true },
        });
      } else {
        // day 0 = due today
        invoices = await prisma.invoice.findMany({
          where: {
            status: { in: [...openStatuses] },
            dueDate: { gte: startOfDay(base), lte: endOfDay(base) },
          },
          select: { id: true, dueDate: true, roomNo: true },
        });
      }

      for (const inv of invoices) {
        try {
          await prisma.outboxEvent.create({
            data: {
              id: uuidv4(),
              aggregateType: 'Invoice',
              aggregateId: inv.id,
              eventType: 'ConfigurableReminder',
              payload: {
                invoiceId: inv.id,
                configId: config.id,
                periodDays: config.periodDays,
                messageTh: config.messageTh,
                messageEn: config.messageEn,
                dueDate: inv.dueDate.toISOString().split('T')[0],
              },
              retryCount: 0,
            },
          });
          scheduled++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`Invoice ${inv.id}: ${msg}`);
        }
      }
    }

    logger.info({
      type: 'reminders_scheduled',
      date: base.toISOString().split('T')[0],
      configsUsed: configs.length,
      scheduled,
      errors: errors.length,
    });

    return { scheduled, dueSoon: 0, dueToday: 0, overdue: 0, errors };
  }

  /**
   * Fallback default reminder logic when no ReminderConfig records exist.
   */
  private async runDailyDefault(today: Date): Promise<{
    scheduled: number;
    dueSoon: number;
    dueToday: number;
    overdue: number;
    errors: string[];
  }> {
    const base = startOfDay(today);

    const dueSoonDay = new Date(base);
    dueSoonDay.setDate(dueSoonDay.getDate() + DEFAULT_DUE_SOON_DAYS);
    const dueSoonStart = startOfDay(dueSoonDay);
    const dueSoonEnd = endOfDay(dueSoonDay);

    const dueTodayStart = startOfDay(base);
    const dueTodayEnd = endOfDay(base);

    const overdueDay = new Date(base);
    overdueDay.setDate(overdueDay.getDate() - DEFAULT_OVERDUE_DAYS);
    const overdueStart = startOfDay(overdueDay);
    const overdueEnd = endOfDay(overdueDay);

    const openStatuses = ['GENERATED', 'SENT', 'VIEWED'] as const;

    const [dueSoon, dueToday, overdue3] = await Promise.all([
      prisma.invoice.findMany({
        where: { status: { in: [...openStatuses] }, dueDate: { gte: dueSoonStart, lte: dueSoonEnd } },
        select: { id: true, dueDate: true },
      }),
      prisma.invoice.findMany({
        where: { status: { in: [...openStatuses] }, dueDate: { gte: dueTodayStart, lte: dueTodayEnd } },
        select: { id: true, dueDate: true },
      }),
      prisma.invoice.findMany({
        where: { status: { in: ['SENT', 'VIEWED', 'OVERDUE'] }, dueDate: { gte: overdueStart, lte: overdueEnd } },
        select: { id: true, dueDate: true },
      }),
    ]);

    let scheduled = 0;
    const errors: string[] = [];

    for (const inv of dueSoon) {
      try {
        await prisma.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: 'Invoice',
            aggregateId: inv.id,
            eventType: EventTypes.INVOICE_REMINDER_DUE_SOON,
            payload: { invoiceId: inv.id, dueDate: inv.dueDate.toISOString().split('T')[0] },
            retryCount: 0,
          },
        });
        scheduled++;
      } catch (e) {
        errors.push(String(e));
      }
    }

    for (const inv of dueToday) {
      try {
        await prisma.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: 'Invoice',
            aggregateId: inv.id,
            eventType: EventTypes.INVOICE_REMINDER_DUE_TODAY,
            payload: { invoiceId: inv.id, dueDate: inv.dueDate.toISOString().split('T')[0] },
            retryCount: 0,
          },
        });
        scheduled++;
      } catch (e) {
        errors.push(String(e));
      }
    }

    for (const inv of overdue3) {
      try {
        await prisma.outboxEvent.create({
          data: {
            id: uuidv4(),
            aggregateType: 'Invoice',
            aggregateId: inv.id,
            eventType: EventTypes.INVOICE_REMINDER_OVERDUE,
            payload: { invoiceId: inv.id, dueDate: inv.dueDate.toISOString().split('T')[0], daysOverdue: DEFAULT_OVERDUE_DAYS },
            retryCount: 0,
          },
        });
        scheduled++;
      } catch (e) {
        errors.push(String(e));
      }
    }

    logger.info({
      type: 'reminders_scheduled_default',
      date: base.toISOString().split('T')[0],
      dueSoon: dueSoon.length,
      dueToday: dueToday.length,
      overdue3: overdue3.length,
      scheduled,
    });

    return { scheduled, dueSoon: dueSoon.length, dueToday: dueToday.length, overdue: overdue3.length, errors };
  }

  /**
   * Apply late fees to all OVERDUE invoices based on their room's BillingRule.
   * Returns count of invoices updated and total fees applied.
   */
  async applyLateFees(): Promise<{ updated: number; totalFees: number; errors: string[] }> {
    const now = new Date();
    const errors: string[] = [];

    const overdueInvoices = await prisma.invoice.findMany({
      where: { status: 'OVERDUE' },
      include: {
        roomBilling: {
          include: { effectiveRule: true },
        },
      },
    });

    let updated = 0;
    let totalFees = 0;

    for (const invoice of overdueInvoices) {
      const rule = invoice.roomBilling?.effectiveRule;
      if (!rule) continue;

      const penaltyPerDay = Number(rule.penaltyPerDay ?? 0);
      const maxPenalty = Number(rule.maxPenalty ?? 0);

      if (penaltyPerDay <= 0) continue;

      const dueDate = new Date(invoice.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) continue;

      const lateFee = calculateLateFee(daysOverdue, penaltyPerDay, maxPenalty);

      try {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            lateFeeAmount: lateFee,
            lateFeeAppliedAt: now,
          },
        });
        updated++;
        totalFees += Number(lateFee);
      } catch (err) {
        errors.push(`Invoice ${invoice.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    logger.info({
      type: 'late_fees_applied',
      updated,
      totalFees,
      errors: errors.length,
    });

    return { updated, totalFees, errors };
  }

  /**
   * Build reminder message text from template variables.
   */
  buildReminderText(
    template: string,
    vars: { roomNo: string; amount: string; dueDate: string; daysOverdue?: number }
  ): string {
    return template
      .replace(/\{\{roomNo\}\}/g, vars.roomNo)
      .replace(/\{\{amount\}\}/g, vars.amount)
      .replace(/\{\{dueDate\}\}/g, vars.dueDate)
      .replace(/\{\{daysOverdue\}\}/g, String(vars.daysOverdue ?? 0));
  }
}

export function createReminderService(): ReminderService {
  return new ReminderService();
}