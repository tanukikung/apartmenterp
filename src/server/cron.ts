import cron from 'node-cron';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/utils/logger';
import { getServiceContainer } from '@/lib/service-container';
import { ReminderService } from '@/modules/reminders/reminder.service';

let initialized = false;

// Vercel serverless functions do not support node-cron (ephemeral execution context).
// When deployed on Vercel, use vercel.json cron jobs instead. The cron.ts worker process
// is only started in self-hosted environments where node-cron works.
const isVercelServerless = Boolean(process.env.VERCEL);

export function startCronIfEnabled(): void {
  if (initialized) return;
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.CRON_ENABLED === 'false') return;
  if (isVercelServerless) return;  // node-cron incompatible with Vercel serverless
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
      const svc = getServiceContainer().invoiceService;
      const results = await Promise.allSettled(
        locked.map((r) => svc.generateInvoiceFromBilling(r.id))
      );
      const failures: Array<{ id: string; error: string }> = [];
      for (let i = 0; i < locked.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
          const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
          failures.push({ id: locked[i].id, error: reason });
          logger.warn({ type: 'cron_generate_invoice_skip', id: locked[i].id, error: reason });
        }
      }
      logger.info({
        type: 'cron_generate_invoices_done',
        total: locked.length,
        succeeded: locked.length - failures.length,
        failed: failures.length,
        failures,
      });
    } catch (e) {
      logger.error({ type: 'cron_generate_invoices_error', error: e instanceof Error ? e.message : String(e) });
    }
  });

  cron.schedule('0 4 * * *', async () => {
    try {
      const svc = getServiceContainer().invoiceService;
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

  // Contract expiry check — runs daily at 9am
  // Notifies tenants with LINE accounts whose contracts expire within 30 days
  cron.schedule('0 9 * * *', async () => {
    try {
      const svc = getServiceContainer().contractService;
      await svc.checkExpiringContracts(30);
      logger.info({ type: 'cron_contract_expiry_check_done' });
    } catch (e) {
      logger.error({ type: 'cron_contract_expiry_error', error: e instanceof Error ? e.message : String(e) });
    }
  });
}

export function isCronInitialized(): boolean {
  return initialized;
}
