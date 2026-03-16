import { prisma } from '@/lib/db/client';
import { EventTypes } from '@/lib/events';
import { logger } from '@/lib/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { Json } from '@/types/prisma-json';

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

export class ReminderService {
  async runDaily(today: Date = new Date()) {
    const base = startOfDay(today);

    const dueSoonDay = new Date(base);
    dueSoonDay.setDate(dueSoonDay.getDate() + 3);
    const dueSoonStart = startOfDay(dueSoonDay);
    const dueSoonEnd = endOfDay(dueSoonDay);

    const dueTodayStart = startOfDay(base);
    const dueTodayEnd = endOfDay(base);

    const overdueDay = new Date(base);
    overdueDay.setDate(overdueDay.getDate() - 3);
    const overdueStart = startOfDay(overdueDay);
    const overdueEnd = endOfDay(overdueDay);

    // Open statuses (not paid)
    const openStatuses = ['GENERATED', 'SENT', 'VIEWED'] as const;

    // Due in 3 days
    const dueSoon = await prisma.invoice.findMany({
      where: {
        status: { in: [...openStatuses] },
        dueDate: { gte: dueSoonStart, lte: dueSoonEnd },
      },
      select: { id: true, dueDate: true },
    });

    // Due today
    const dueToday = await prisma.invoice.findMany({
      where: {
        status: { in: [...openStatuses] },
        dueDate: { gte: dueTodayStart, lte: dueTodayEnd },
      },
      select: { id: true, dueDate: true },
    });

    // Overdue by 3 days (including invoices previously marked OVERDUE but unpaid)
    const overdue3 = await prisma.invoice.findMany({
      where: {
        status: { in: ['SENT', 'VIEWED', 'OVERDUE'] },
        dueDate: { gte: overdueStart, lte: overdueEnd },
      },
      select: { id: true, dueDate: true },
    });

    let created = 0;
    for (const inv of dueSoon) {
      await prisma.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Invoice',
          aggregateId: inv.id,
          eventType: EventTypes.INVOICE_REMINDER_DUE_SOON,
          payload: {
            invoiceId: inv.id,
            dueDate: inv.dueDate.toISOString().split('T')[0],
          } as unknown as Json,
          retryCount: 0,
        },
      });
      created++;
    }

    for (const inv of dueToday) {
      await prisma.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Invoice',
          aggregateId: inv.id,
          eventType: EventTypes.INVOICE_REMINDER_DUE_TODAY,
          payload: {
            invoiceId: inv.id,
            dueDate: inv.dueDate.toISOString().split('T')[0],
          } as unknown as Json,
          retryCount: 0,
        },
      });
      created++;
    }

    for (const inv of overdue3) {
      await prisma.outboxEvent.create({
        data: {
          id: uuidv4(),
          aggregateType: 'Invoice',
          aggregateId: inv.id,
          eventType: EventTypes.INVOICE_REMINDER_OVERDUE,
          payload: {
            invoiceId: inv.id,
            dueDate: inv.dueDate.toISOString().split('T')[0],
            daysOverdue: 3,
          } as unknown as Json,
          retryCount: 0,
        },
      });
      created++;
    }

    logger.info({
      type: 'reminders_scheduled',
      date: base.toISOString().split('T')[0],
      dueSoon: dueSoon.length,
      dueToday: dueToday.length,
      overdue3: overdue3.length,
      outboxEvents: created,
    });

    return { dueSoon: dueSoon.length, dueToday: dueToday.length, overdue3: overdue3.length, outboxEvents: created };
  }
}

let reminderServiceInstance: ReminderService | null = null;
export function getReminderService(): ReminderService {
  if (!reminderServiceInstance) {
    reminderServiceInstance = new ReminderService();
  }
  return reminderServiceInstance;
}
