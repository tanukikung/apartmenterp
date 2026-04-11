import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventTypes } from '@/lib';
import { prisma } from '@/lib/db/client';
import { getServiceContainer } from '@/lib/service-container';

vi.mock('@/lib/db/client', () => {
  return {
    prisma: {
      invoice: {
        findMany: vi.fn(),
      },
      outboxEvent: {
        create: vi.fn(),
      },
      reminderConfig: {
        findMany: vi.fn().mockResolvedValue([]), // no configs = uses runDailyDefault
      },
    },
  };
});

describe('Invoice reminders selection and outbox', () => {
  beforeEach(() => {
    (prisma.invoice.findMany as any).mockReset();
    (prisma.outboxEvent.create as any).mockReset();
    // Reset reminderConfig to return empty so runDailyDefault is used
    (prisma as any).reminderConfig.findMany.mockResolvedValue([]);
  });

  it('selects due soon, due today, overdue by 3 and writes outbox events', async () => {
    const service = getServiceContainer().reminderService;
    const base = new Date('2026-03-10T00:00:00Z');

    (prisma as any).reminderConfig.findMany.mockResolvedValue([]);
    (prisma.invoice.findMany as any)
      .mockResolvedValueOnce([{ id: 'inv-soon-1', dueDate: new Date('2026-03-13T12:00:00Z') }]) // due soon
      .mockResolvedValueOnce([{ id: 'inv-today-1', dueDate: new Date('2026-03-10T08:00:00Z') }]) // due today
      .mockResolvedValueOnce([{ id: 'inv-over-1', dueDate: new Date('2026-03-07T09:00:00Z') }]); // overdue 3

    const res = await service.runDaily(base);

    // runDailyDefault returns { scheduled, dueSoon, dueToday, overdue, errors }
    expect(res.dueSoon).toBe(1);
    expect(res.dueToday).toBe(1);
    expect(res.overdue).toBe(1);
    expect(res.scheduled).toBe(3);
    const calls = (prisma.outboxEvent.create as any).mock.calls.map((c: any) => c[0].data.eventType);
    expect(calls).toContain(EventTypes.INVOICE_REMINDER_DUE_SOON);
    expect(calls).toContain(EventTypes.INVOICE_REMINDER_DUE_TODAY);
    expect(calls).toContain(EventTypes.INVOICE_REMINDER_OVERDUE);
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(3);
  });
});
