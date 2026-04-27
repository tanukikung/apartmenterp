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

  // Stale maintenance check — runs daily at 9:30am.
  // Flags rooms that have been in MAINTENANCE status for more than 14 days
  // without a resolved ticket. Alerts the owner so they can investigate
  // whether the room is genuinely awaiting repair or is a ghost-booking risk.
  cron.schedule('30 9 * * *', async () => {
    try {
      const staleDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const staleTickets = await prisma.maintenanceTicket.findMany({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          createdAt: { lt: staleDate },
        },
        select: {
          id: true,
          roomNo: true,
          createdAt: true,
          title: true,
          priority: true,
        },
      });
      if (staleTickets.length === 0) {
        logger.info({ type: 'cron_stale_maintenance_done', staleCount: 0 });
        return;
      }
      // Write an outbox event for each stale ticket so admins are alerted.
      // The outbox processor will surface these as DLQ events for manual review.
      const { v4: uuidv4 } = await import('uuid');
      const events = staleTickets.map((t) => ({
        aggregateType: 'MaintenanceTicket' as const,
        aggregateId: t.id,
        eventType: 'MAINTENANCE_TICKET_STALE' as const,
        payload: {
          roomNo: t.roomNo,
          ticketId: t.id,
          title: t.title,
          priority: t.priority,
          staleDays: Math.floor((Date.now() - t.createdAt.getTime()) / 86_400_000),
          detectedAt: new Date().toISOString(),
        },
        retryCount: 0,
        id: uuidv4(),
      }));
      await prisma.outboxEvent.createMany({ data: events });
      logger.warn({
        type: 'cron_stale_maintenance_alert',
        staleCount: staleTickets.length,
        rooms: staleTickets.map((t) => t.roomNo),
      });
    } catch (e) {
      logger.error({ type: 'cron_stale_maintenance_error', error: e instanceof Error ? e.message : String(e) });
    }
  });

  // Audit log rotation — weekly Sunday 02:00.
  // Deletes rows older than AUDIT_LOG_RETENTION_DAYS (default 365). Keeps the
  // table bounded so indexes stay fast. Set retention to 0 to disable.
  cron.schedule('0 2 * * 0', async () => {
    try {
      const retentionDays = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365);
      if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
        logger.info({ type: 'cron_audit_rotation_skipped', retentionDays });
        return;
      }
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      const result = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      logger.info({
        type: 'cron_audit_rotation_done',
        retentionDays,
        cutoff: cutoff.toISOString(),
        deleted: result.count,
      });
    } catch (e) {
      logger.error({
        type: 'cron_audit_rotation_error',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

export function isCronInitialized(): boolean {
  return initialized;
}
