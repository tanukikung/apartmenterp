/**
 * Job runners — inline execution functions for each background job.
 *
 * Each runner returns { count, message } so API routes can report results.
 * All DB operations use the shared Prisma client and are safe to call
 * concurrently from multiple requests (they are idempotent or use transactions).
 */

import { prisma } from '@/lib';

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
      dueDay: 25,
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
// Reports the current number of overdue invoices.
// Extend this function to create fee records or add notes when a late-fee
// billing model is introduced.
export async function runLateFee(): Promise<JobResult> {
  const count = await prisma.invoice.count({
    where: { status: 'OVERDUE' },
  });

  return {
    count,
    message: `${count} overdue invoice(s) reviewed for late-fee eligibility`,
  };
}

// ── 5. Database cleanup ─────────────────────────────────────────────────────
// Deletes audit log entries older than 90 days to keep the table lean.
export async function runDbCleanup(): Promise<JobResult> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return {
    count: result.count,
    message: `${result.count} audit log entries older than 90 days deleted`,
  };
}

// ── Registry ────────────────────────────────────────────────────────────────

export const JOB_RUNNERS: Record<string, () => Promise<JobResult>> = {
  'overdue-flag':     runOverdueFlag,
  'billing-generate': runBillingGenerate,
  'invoice-send':     runInvoiceSend,
  'late-fee':         runLateFee,
  'db-cleanup':       runDbCleanup,
};

export const VALID_JOB_IDS = Object.keys(JOB_RUNNERS);

export function isValidJobId(id: string): id is keyof typeof JOB_RUNNERS {
  return id in JOB_RUNNERS;
}
