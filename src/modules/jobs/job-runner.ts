/**
 * Job runners — inline execution functions for each background job.
 *
 * Each runner returns { count, message } so API routes can report results.
 * All DB operations use the shared Prisma client and are safe to call
 * concurrently from multiple requests (they are idempotent or use transactions).
 */

import { prisma } from '@/lib';
import { logAudit } from '@/modules/audit';
import { runLateFeeJob } from './late-fee.job';

const DEFAULT_DUE_DAY = 25;
import { logger } from '@/lib/utils/logger';

export type JobResult = {
  count: number;
  message: string;
};

// ── 1. Mark overdue invoices ────────────────────────────────────────────────
// Sets status = OVERDUE for any invoice whose dueDate is in the past and
// that has not yet been paid or cancelled.
export async function runOverdueFlag(): Promise<JobResult> {
  const now = new Date();
  const result = await prisma.invoice.updateMany({
    where: {
      status: { in: ['GENERATED', 'SENT', 'VIEWED'] },
      dueDate: { lt: now },
    },
    data: { status: 'OVERDUE' },
  });

  return {
    count: result.count,
    message: `${result.count} invoice(s) marked as OVERDUE`,
  };
}

// ── 2. Auto-generate billing period ────────────────────────────────────────
// Creates a BillingPeriod record for the current calendar month if one does
// not already exist. Rooms need a billing period before billings can be
// generated for them.
export async function runBillingGenerate(): Promise<JobResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth() is 0-based

  const existing = await prisma.billingPeriod.findFirst({
    where: { year, month },
  });

  if (existing) {
    return {
      count: 0,
      message: `Billing period for ${year}/${String(month).padStart(2, '0')} already exists`,
    };
  }

  await prisma.billingPeriod.create({
    data: {
      year,
      month,
      status: 'OPEN',
      dueDay: DEFAULT_DUE_DAY,
    },
  });

  return {
    count: 1,
    message: `Billing period created for ${year}/${String(month).padStart(2, '0')}`,
  };
}

// ── 3. Send pending invoices ────────────────────────────────────────────────
// Advances GENERATED invoices to SENT status and stamps sentAt.
// In production this would also dispatch LINE notifications; here it just
// updates the status so the UI reflects the correct state.
export async function runInvoiceSend(): Promise<JobResult> {
  const result = await prisma.invoice.updateMany({
    where: { status: 'GENERATED' },
    data: { status: 'SENT', sentAt: new Date() },
  });

  return {
    count: result.count,
    message: `${result.count} invoice(s) marked as SENT`,
  };
}

// ── 4. Late-fee check ───────────────────────────────────────────────────────
// Applies late fees based on BillingRule penaltyPerDay, updates Invoice lateFeeAmount.
export async function runLateFee(): Promise<JobResult> {
  const result = await runLateFeeJob();
  return {
    count: result.updated,
    message: `${result.updated} invoice(s) updated, total fees ${result.totalFees.toFixed(2)}, skipped ${result.skipped}`,
  };
}

// ── 5. Database cleanup ─────────────────────────────────────────────────────
// Deletes audit log entries older than 90 days to keep the table lean.
export async function runDbCleanup(): Promise<JobResult> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  await logAudit({
    actorId: 'system',
    actorRole: 'SYSTEM',
    action: 'DB_CLEANUP_STARTED',
    entityType: 'AUDIT_LOG',
    entityId: 'cleanup',
    metadata: { cutoff: cutoff.toISOString(), retentionDays: 90 },
  });

  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  logger.info({
    type: 'db_cleanup_completed',
    deletedCount: result.count,
    cutoff: cutoff.toISOString(),
    retentionDays: 90,
  });

  await logAudit({
    actorId: 'system',
    actorRole: 'SYSTEM',
    action: 'DB_CLEANUP_COMPLETED',
    entityType: 'AUDIT_LOG',
    entityId: 'cleanup',
    metadata: { deletedCount: result.count, cutoff: cutoff.toISOString(), retentionDays: 90 },
  });

  return {
    count: result.count,
    message: `${result.count} audit log entries older than 90 days deleted`,
  };
}

// ── 6. Contract expiry check ─────────────────────────────────────────────────
// Checks for contracts expiring in 30/60/90 days and notifies staff via LINE
// and creates in-app notifications for admins.
export async function runContractExpiryCheck(): Promise<JobResult> {
  const now = new Date();
  const { sendLineMessage } = await import('@/lib');

  const expiryThresholds = [30, 60, 90];
  let totalNotified = 0;

  for (const daysAhead of expiryThresholds) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const prevDays = daysAhead === 30 ? 0 : daysAhead === 60 ? 31 : 61;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + prevDays + 1);

    const expiringContracts = await prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: startDate, lte: futureDate },
      },
      include: { room: true, primaryTenant: true },
    });

    for (const contract of expiringContracts) {
      const daysUntilExpiry = Math.ceil(
        (contract.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const urgencyLabel = daysUntilExpiry <= 30 ? 'ด่วน' : daysUntilExpiry <= 60 ? 'แจ้งเตือน' : 'แจ้งล่วงหน้า';
      const message = `[${urgencyLabel}] สัญญาเช่าห้อง ${contract.roomNo} จะหมดอายุในอีก ${daysUntilExpiry} วัน (${contract.endDate.toLocaleDateString('th-TH')}) ผู้เช่า: ${contract.primaryTenant.firstName} ${contract.primaryTenant.lastName}`;

      const admins = await prisma.adminUser.findMany({ where: { isActive: true } });

      for (const admin of admins) {
        const existing = await prisma.notification.findFirst({
          where: {
            type: 'NOTICE',
            roomNo: contract.roomNo,
            content: message,
            createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!existing) {
          const notification = await prisma.notification.create({
            data: {
              type: 'NOTICE',
              roomNo: contract.roomNo,
              tenantId: contract.primaryTenantId,
              scheduledAt: now,
              status: 'PENDING',
              content: message,
            },
          });

          const tenant = contract.primaryTenant;
          if (tenant.lineUserId) {
            try {
              await sendLineMessage(
                tenant.lineUserId,
                `📢 แจ้งเตือน: สัญญาเช่าห้อง ${contract.roomNo} จะหมดอายุในอีก ${daysUntilExpiry} วัน\n\nกรุณาติดต่อเจ้าหน้าที่เพื่อต่ออายุสัญญา`
              );
              await prisma.notification.update({
                where: { id: notification.id },
                data: { status: 'SENT', sentAt: new Date() },
              });
            } catch {
              // LINE not configured — skip silently
            }
          }
        }
      }
      totalNotified++;
    }
  }

  return {
    count: totalNotified,
    message: `${totalNotified} contract(s) notified for expiry`,
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

export const JOB_RUNNERS: Record<string, () => Promise<JobResult>> = {
  'overdue-flag':      runOverdueFlag,
  'billing-generate':  runBillingGenerate,
  'invoice-send':      runInvoiceSend,
  'late-fee':          runLateFee,
  'db-cleanup':        runDbCleanup,
  'contract-expiry':   runContractExpiryCheck,
};

export const VALID_JOB_IDS = Object.keys(JOB_RUNNERS);

export function isValidJobId(id: string): id is keyof typeof JOB_RUNNERS {
  return id in JOB_RUNNERS;
}
