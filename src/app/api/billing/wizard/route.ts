import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { requireOperator } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { getServiceContainer } from '@/lib/service-container';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { BILLING_STATUS, BILLING_PERIOD_STATUS, INVOICE_STATUS } from '@/lib/constants';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ─── Schema ─────────────────────────────────────────────────────────────────────

const wizardActionSchema = z.object({
  action: z.enum(['create-period', 'lock-and-generate', 'send-all']),
  dueDay: z.number().int().min(1).max(31).optional(),
  periodId: z.string().uuid().optional(),
});

// ─── Types ─────────────────────────────────────────────────────────────────────

export type WizardStep = 'import' | 'review' | 'generate' | 'send' | 'complete';

export interface WizardPeriodData {
  id: string;
  year: number;
  month: number;
  status: 'OPEN' | 'LOCKED' | 'CLOSED';
  dueDay: number;
  totalRecords: number;
  totalRooms: number;
  missingRooms: number;
  totalAmount: number;
  invoiceCount: number;
  pendingInvoices: number;
  generatedInvoices: number;
  sentInvoices: number;
}

export interface WizardData {
  currentStep: WizardStep;
  period: WizardPeriodData | null;
  periodExists: boolean;
  // For import step
  latestBatch: {
    id: string;
    filename: string;
    status: string;
    rowCount: number;
    importedAt: string | null;
  } | null;
  // For generate step
  lockedCount: number;
  toGenerateCount: number;
  // For send step
  generatedInvoiceIds: string[];
  sentCount: number;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

async function getCurrentPeriod(): Promise<WizardPeriodData | null> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const period = await prisma.billingPeriod.findFirst({
    where: { year, month },
  });

  if (!period) return null;

  const totalActiveRooms = await prisma.room.count({
    where: { roomStatus: { in: ['VACANT', 'OCCUPIED'] } },
  });

  const roomBillings = await prisma.roomBilling.findMany({
    where: { billingPeriodId: period.id },
    include: { invoice: { select: { id: true, status: true } } },
  });

  const recordCount = roomBillings.length;
  const missingRooms = Math.max(0, totalActiveRooms - recordCount);
  const totalAmount = roomBillings.reduce((sum, rb) => sum + Number(rb.totalDue), 0);

  const invoices = roomBillings.map(rb => rb.invoice).filter(Boolean);
  const generatedInvoices = invoices.filter(i => i?.status === INVOICE_STATUS.GENERATED).length;
  const sentInvoices = invoices.filter(i => i?.status === 'SENT' || i?.status === 'VIEWED').length;

  return {
    id: period.id,
    year: period.year,
    month: period.month,
    status: period.status as 'OPEN' | 'LOCKED' | 'CLOSED',
    dueDay: period.dueDay,
    totalRecords: recordCount,
    totalRooms: totalActiveRooms,
    missingRooms,
    totalAmount,
    invoiceCount: invoices.length,
    pendingInvoices: invoices.filter(i => i?.status === INVOICE_STATUS.GENERATED).length,
    generatedInvoices,
    sentInvoices,
  };
}

async function getLatestBatch(periodId: string | null): Promise<{ id: string; filename: string; status: string; rowCount: number; importedAt: string | null; } | null> {
  if (!periodId) return null;
  const batch = await prisma.importBatch.findFirst({
    where: { billingPeriodId: periodId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, filename: true, status: true, createdAt: true, rowsImported: true },
  });
  if (!batch) return null;
  return {
    id: batch.id,
    filename: batch.filename,
    status: batch.status,
    rowCount: batch.rowsImported,
    importedAt: batch.createdAt.toISOString(),
  };
}

// ─── GET: Get current wizard state ────────────────────────────────────────────

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireOperator(req);

  const period = await getCurrentPeriod();
  const periodExists = period !== null;

  // Determine current step
  let step: WizardStep = 'import';
  if (period) {
    if (period.status === BILLING_PERIOD_STATUS.CLOSED || period.generatedInvoices > 0 && period.sentInvoices === period.generatedInvoices) {
      step = 'complete';
    } else if (period.generatedInvoices > 0) {
      step = 'send';
    } else if (period.status === BILLING_PERIOD_STATUS.LOCKED) {
      step = 'generate';
    } else if (period.status === BILLING_PERIOD_STATUS.OPEN || period.totalRecords > 0) {
      step = 'review';
    }
  }

  const latestBatch = period ? await getLatestBatch(period.id) : null;

  const data: WizardData = {
    currentStep: step,
    period,
    periodExists,
    latestBatch,
    lockedCount: 0,
    toGenerateCount: period ? period.totalRecords : 0,
    generatedInvoiceIds: [],
    sentCount: period?.sentInvoices ?? 0,
  };

  return NextResponse.json({ success: true, data } as ApiResponse<WizardData>);
});

// ─── POST: Perform wizard action ──────────────────────────────────────────────

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`billing-wizard:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many billing requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }

  requireOperator(req);

  const body = await req.json();
  const input = wizardActionSchema.parse(body);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // ── Action: create-period ───────────────────────────────────────────────────
  if (input.action === 'create-period') {
    const existing = await prisma.billingPeriod.findFirst({ where: { year, month } });
    if (existing) {
      return NextResponse.json({ success: true, data: { periodId: existing.id } });
    }
    const period = await prisma.billingPeriod.create({
      data: {
        id: uuidv4(),
        year,
        month,
        status: BILLING_PERIOD_STATUS.OPEN,
        dueDay: input.dueDay ?? 25,
      },
    });
    return NextResponse.json({ success: true, data: { periodId: period.id } });
  }

  // ── Action: lock-and-generate ──────────────────────────────────────────────
  if (input.action === 'lock-and-generate') {
    const periodId = input.periodId;
    const { invoiceService } = getServiceContainer();

    // FIX C04: Wrap ALL writes (lock DRAFT records, update period, generate
    // invoices) in a single $transaction so the period is never left LOCKED with
    // missing invoices on partial failure.
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock all DRAFT records
      const lockResult = await tx.roomBilling.updateMany({
        where: { billingPeriodId: periodId, status: BILLING_STATUS.DRAFT },
        data: { status: BILLING_STATUS.LOCKED },
      });

      // Update period status to LOCKED
      await tx.billingPeriod.update({
        where: { id: periodId },
        data: { status: BILLING_PERIOD_STATUS.LOCKED },
      });

      // 2. Generate invoices for all LOCKED records without invoices
      const lockedBillings = await tx.roomBilling.findMany({
        where: { billingPeriodId: periodId, status: BILLING_STATUS.LOCKED },
        include: { invoice: { select: { id: true } } },
      });

      const toGenerate = lockedBillings.filter(rb => !rb.invoice);

      // HIGH-69: Track actual successes so the response reflects real outcomes,
      // not just attempted count. Errors are logged individually so they can be
      // traced from server logs even when the overall transaction succeeds.
      let actualGenerated = 0;
      const generationErrors: string[] = [];
      for (const rb of toGenerate) {
        try {
          await invoiceService.generateInvoiceFromBilling(rb.id);
          actualGenerated++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          generationErrors.push(`Billing ${rb.id}: ${msg}`);
          logger.error({
            type: 'billing_wizard_generate_error',
            billingRecordId: rb.id,
            error: msg,
          });
        }
      }

      return {
        locked: lockResult.count,
        generated: actualGenerated,
        errors: generationErrors.length,
        periodId,
      };
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  }

  // ── Action: send-all ───────────────────────────────────────────────────────
  if (input.action === 'send-all') {
    const periodId = input.periodId;
    const { invoiceService } = getServiceContainer();

    // Get all GENERATED invoices for this period
    const invoices = await prisma.invoice.findMany({
      where: {
        roomBilling: { billingPeriodId: periodId },
        status: INVOICE_STATUS.GENERATED,
      },
      select: { id: true, roomNo: true },
    });

    let sent = 0;
    let failed = 0;
    const failedInvoices: Array<{ id: string; error: string }> = [];
    for (const inv of invoices) {
      try {
        await invoiceService.sendInvoice(inv.id, { sendToLine: true, channel: 'LINE' });
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed++;
        failedInvoices.push({ id: inv.id, error: msg });
        logger.warn({ type: 'billing_wizard_send_error', invoiceId: inv.id, error: msg });
      }
    }

    logger.info({
      type: 'billing_wizard_send_all',
      periodId,
      total: invoices.length,
      sent,
      failed,
    });

    return NextResponse.json({
      success: true,
      data: { sent, failed, total: invoices.length },
    });
  }

  return NextResponse.json(
    { success: false, error: { code: 'INVALID_ACTION', message: `Unknown action: ${input.action}` } },
    { status: 400 }
  );
});
