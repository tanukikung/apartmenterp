import cron from 'node-cron';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { ReminderService } from '@/modules/reminders/reminder.service';

let initialized = false;

export function startCronIfEnabled(): void {
  if (initialized) return;
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (process.env.CRON_ENABLED === 'false') return;
  initialized = true;

  cron.schedule('0 3 1 * *', async () => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const locked = await prisma.roomBilling.findMany({
        where: {
          status: 'LOCKED',
          billingPeriod: { year, month },
        },
        select: { id: true },
      });
      const svc = getInvoiceService();
      for (const r of locked) {
        try {
          await svc.generateInvoiceFromBilling(r.id);
        } catch (e) {
          logger.warn({ type: 'cron_generate_invoice_skip', id: r.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
      logger.info({ type: 'cron_generate_invoices_done', count: locked.length });
    } catch (e) {
      logger.error({ type: 'cron_generate_invoices_error', error: e instanceof Error ? e.message : String(e) });
    }
  });

  cron.schedule('0 4 * * *', async () => {
    try {
      const svc = getInvoiceService();
      await svc.checkOverdueInvoices();
      logger.info({ type: 'cron_overdue_check_done' });
    } catch (e) {
      logger.error({ type: 'cron_overdue_check_error', error: e instanceof Error ? e.message : String(e) });
    }
  });

  cron.schedule('0 8 * * *', async () => {
    try {
      const svc = new ReminderService();
      const r = await svc.runDaily(new Date());
      logger.info({ type: 'cron_reminders_done', ...r });
    } catch (e) {
      logger.error({ type: 'cron_reminders_error', error: e instanceof Error ? e.message : String(e) });
    }
  });
}

export function isCronInitialized(): boolean {
  return initialized;
}
