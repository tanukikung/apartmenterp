import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getReminderService } from '@/modules/reminders/reminder.service';
import { EventTypes } from '@/lib';
import { prisma } from '@/lib/db/client';

vi.mock('@/lib/db/client', () => {
  return {
    prisma: {
      invoice: {
        findMany: vi.fn(),
      },
      outboxEvent: {
        create: vi.fn(),
      },
    },
  };
});

describe('Invoice reminders selection and outbox', () => {
  beforeEach(() => {
    (prisma.invoice.findMany as any).mockReset();
    (prisma.outboxEvent.create as any).mockReset();
  });

  it('selects due soon, due today, overdue by 3 and writes outbox events', async () => {
    const service = getReminderService();
    const base = new Date('2026-03-10T00:00:00Z');

    (prisma.invoice.findMany as any)
      .mockResolvedValueOnce([{ id: 'inv-soon-1', dueDate: new Date('2026-03-13T12:00:00Z') }]) // due soon
      .mockResolvedValueOnce([{ id: 'inv-today-1', dueDate: new Date('2026-03-10T08:00:00Z') }]) // due today
      .mockResolvedValueOnce([{ id: 'inv-over-1', dueDate: new Date('2026-03-07T09:00:00Z') }]); // overdue 3

    const res = await service.runDaily(base);

    expect(res).toEqual({ dueSoon: 1, dueToday: 1, overdue3: 1, outboxEvents: 3 });
    const calls = (prisma.outboxEvent.create as any).mock.calls.map((c: any) => c[0].data.eventType);
    expect(calls).toContain(EventTypes.INVOICE_REMINDER_DUE_SOON);
    expect(calls).toContain(EventTypes.INVOICE_REMINDER_DUE_TODAY);
    expect(calls).toContain(EventTypes.INVOICE_REMINDER_OVERDUE);
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(3);
  });
});
