import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db/client';
import { ReminderService } from '@/modules/reminders/reminder.service';
import { EventTypes } from '@/lib';
import { getServiceContainer } from '@/lib/service-container';

describe('Cron jobs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('billing generation cron generates invoices once for locked records', async () => {
    const processed = new Set<string>();
    vi.spyOn((prisma as any).roomBilling, 'findMany').mockResolvedValue([
      { id: 'b1' } as any,
      { id: 'b2' } as any,
    ]);
    const svc = getServiceContainer().invoiceService;
    const genSpy = vi.spyOn(svc, 'generateInvoiceFromBilling').mockImplementation(async (id: string) => {
      if (processed.has(id)) throw new Error('duplicate');
      processed.add(id);
      return { invoice: { id: `inv-${id}` } } as any;
    });

    const run = async () => {
      const locked = await (prisma as any).roomBilling.findMany({ where: { status: 'LOCKED' } } as any);
      for (const r of locked) {
        try {
          await svc.generateInvoiceFromBilling(r.id);
        } catch {}
      }
    };

    await run();
    await run();

    expect(genSpy).toHaveBeenCalledTimes(4);
    expect(processed.size).toBe(2);
  });

  it('reminder cron publishes reminder and creates outbox events', async () => {
    const inv = { id: 'inv-1', dueDate: new Date() };
    vi.spyOn(prisma.invoice, 'findMany').mockResolvedValue([inv] as any);
    const createSpy = vi.spyOn(prisma.outboxEvent, 'create').mockResolvedValue({ id: 'e1' } as any);
    const svc = new ReminderService();
    const r = await svc.runDaily(new Date());
    expect(r.outboxEvents).toBeGreaterThan(0);
    expect(createSpy).toHaveBeenCalled();
  });

  it('overdue scanner marks invoice and queues reminder event', async () => {
    const today = new Date();
    const past = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
    const inv = { id: 'inv-od', dueDate: past, status: 'SENT', roomId: 'room-1', room: { roomNumber: '101' } };
    vi.spyOn(prisma.invoice, 'findMany').mockResolvedValue([inv] as any);
    const updateSpy = vi.spyOn(prisma.invoice, 'update').mockResolvedValue({ ...inv, status: 'OVERDUE' } as any);
    const bus = getServiceContainer().eventBus;
    const pubSpy = vi.spyOn(bus as any, 'publish').mockResolvedValue({ type: EventTypes.INVOICE_MARKED_OVERDUE } as any);
    const svc = getServiceContainer().invoiceService;
    await svc.checkOverdueInvoices();
    expect(updateSpy).toHaveBeenCalled();
    expect(pubSpy).toHaveBeenCalledWith(
      EventTypes.INVOICE_MARKED_OVERDUE,
      'Invoice',
      'inv-od',
      expect.any(Object)
    );
  });
});
