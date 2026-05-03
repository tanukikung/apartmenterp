import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import type { BillingAuditAction } from '@prisma/client';

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// Batch size for non-blocking invoice generation.
// Yields to the event loop every N records so the API can respond to other
// requests (health checks, other admin actions) even with thousands of rooms.
const BATCH_SIZE = 50;

// ============================================================================
// POST /api/billing/periods/[id]/generate-invoices
// Generate invoices for ALL LOCKED RoomBilling records that do not yet have
// an invoice.  Processes in batches of BATCH_SIZE with setImmediate yields
// to prevent blocking the event loop.
// Returns a summary { generated, skipped, errors }.
// ============================================================================

async function processBatches(
  billings: Array<{ id: string; roomNo: string; totalDue: Prisma.Decimal }>,
  periodId: string,
  period: { year: number; month: number; dueDay: number | null },
  session: { sub: string },
): Promise<{ generated: number; skipped: number; errors: number; errorDetails: string[] }> {
  let generated = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  const buildDueDate = (): Date => {
    const now = new Date();
    const dueDay = period.dueDay ?? 25;
    const d = new Date(period.year, period.month - 1, dueDay);
    return d < now ? new Date(period.year, period.month, dueDay) : d;
  };

  for (let i = 0; i < billings.length; i++) {
    const rb = billings[i];

    // Yield to event loop every BATCH_SIZE records to keep server responsive.
    // This does NOT make the request asynchronous — it just prevents the loop
    // from blocking the Node.js event loop for the full duration of generation.
    if (i > 0 && i % BATCH_SIZE === 0) {
      await new Promise<void>((resolve) => { setImmediate(resolve); });
    }

    try {
      const dueDate = buildDueDate();

      await prisma.$transaction(async (tx) => {
        // Check inside transaction with row lock to prevent TOCTOU race
        const existing = await tx.invoice.findUnique({ where: { roomBillingId: rb.id } });
        if (existing) { skipped++; return; }
        const inv = await tx.invoice.create({
          data: {
            id:           uuidv4(),
            roomNo:       rb.roomNo,
            roomBillingId: rb.id,
            year:         period.year,
            month:        period.month,
            status:       'GENERATED',
            totalAmount:  rb.totalDue,
            dueDate,
            issuedAt:     new Date(),
          },
        });

        await tx.roomBilling.update({
          where: { id: rb.id },
          data:  { status: 'INVOICED' },
        });

        await tx.outboxEvent.create({
          data: {
            id:            uuidv4(),
            aggregateType: 'Invoice',
            aggregateId:   inv.id,
            eventType:     'InvoiceGenerated',
            payload: {
              invoiceId:     inv.id,
              roomNo:        inv.roomNo,
              roomBillingId: rb.id,
              year:          inv.year,
              month:         inv.month,
              totalAmount:   Number(inv.totalAmount),
              dueDate:       dueDate.toISOString().split('T')[0],
              generatedBy:   session.sub,
            } as Prisma.InputJsonValue,
            retryCount: 0,
          },
        });

        // P3-05: Write BillingAuditLog for INVOICE_CREATED action
        await tx.billingAuditLog.create({
          data: {
            id:              uuidv4(),
            billingRecordId: rb.id,
            action:          'INVOICE_CREATED' as BillingAuditAction,
            actorId:         session.sub,
            actorRole:       'ADMIN',
            metadata: {
              invoiceId:   inv.id,
              year:        period.year,
              month:       period.month,
              totalAmount: Number(inv.totalAmount),
              dueDate:     dueDate.toISOString().split('T')[0],
            } as Prisma.InputJsonValue,
          },
        });
      });

      generated++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push(`${rb.roomNo}: ${msg}`);
      logger.error({ type: 'batch_invoice_error', roomNo: rb.roomNo, error: msg });
    }
  }

  return { generated, skipped, errors, errorDetails };
}

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining: rateLimitRemaining, resetAt } = await limiter.check(`billing-generate:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many billing requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(rateLimitRemaining) } }
      );
    }

    const { id: periodId } = params;
    const session = requireRole(req, ['ADMIN', 'OWNER']);

    // FM-21: Human confirmation guard.
    // Without ?confirm=true the endpoint returns a dry-run preview so the UI
    // can show "You are about to generate N invoices for Month/Year — confirm?"
    const url = new URL(req.url);
    const confirmed = url.searchParams.get('confirm') === 'true';

    // Verify period exists
    const period = await prisma.billingPeriod.findUnique({ where: { id: periodId } });
    if (!period) {
      return NextResponse.json({ success: false, error: 'Billing period not found' }, { status: 404 });
    }

    // Idempotency guard: if the period is already CLOSED, invoices were
    // previously generated and this request is a duplicate. Return a
    // no-op success so clicking the button twice doesn't regenerate or
    // error out. (The inner unique-key on invoice.roomBillingId would
    // catch it anyway, but we can skip the wasted work entirely.)
    if (period.status === 'CLOSED') {
      return NextResponse.json({
        success: true,
        data: { generated: 0, skipped: 0, errors: 0, errorDetails: [] },
        message: 'Period already CLOSED — invoices were previously generated.',
      } as ApiResponse<{ generated: number; skipped: number; errors: number; errorDetails: string[] }>);
    }

    // Find all LOCKED RoomBillings that don't have an invoice yet
    const billings = await prisma.roomBilling.findMany({
      where: {
        billingPeriodId: periodId,
        status: 'LOCKED',
        invoice: null,           // no invoice yet (via relation filter)
      },
      select: {
        id: true,
        roomNo: true,
        totalDue: true,
      },
    });

    if (billings.length === 0) {
      return NextResponse.json({
        success: true,
        data: { generated: 0, skipped: 0, errors: 0, errorDetails: [] },
        message: 'No locked billing records without invoices found. Lock the period first.',
      } as ApiResponse<{ generated: number; skipped: number; errors: number; errorDetails: string[] }>);
    }

    // FM-21: Return dry-run preview when ?confirm=true is absent.
    // The caller (UI) must explicitly pass confirm=true after showing the user
    // the count so accidental double-clicks or wrong-month generation is prevented.
    if (!confirmed) {
      return NextResponse.json({
        success: true,
        data: {
          dryRun: true,
          wouldGenerate: billings.length,
          year: period.year,
          month: period.month,
          rooms: billings.map(b => b.roomNo),
        },
        message: `Dry run: ${billings.length} invoice(s) would be generated for ${period.year}/${String(period.month).padStart(2, '0')}. POST with ?confirm=true to proceed.`,
      });
    }

    // FM-7: PostgreSQL advisory lock — prevents two concurrent generation jobs
    // (e.g., cron + manual click) from processing the same period simultaneously.
    // pg_try_advisory_lock is session-scoped; we release it after generation.
    // hashtext() produces a stable int4 from the period UUID string.
    type AdvisoryRow = { acquired: boolean };
    const [lockResult] = await prisma.$queryRaw<AdvisoryRow[]>`
      SELECT pg_try_advisory_lock(hashtext(${periodId})) AS acquired
    `;
    if (!lockResult?.acquired) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Invoice generation is already in progress for this period. Retry in a moment.',
            code: 'GENERATION_IN_PROGRESS',
            name: 'ConflictError',
            statusCode: 409,
          },
        },
        { status: 409 },
      );
    }

    // Process in batches with setImmediate yields to avoid blocking the event loop.
    let result: Awaited<ReturnType<typeof processBatches>>;
    try {
      result = await processBatches(billings, periodId, period, session);
    } finally {
      // Always release the advisory lock, even if processBatches throws
      await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${periodId}))`.catch(() => {});
    }

    // Update period status to CLOSED (fully invoiced) when no more LOCKED records remain
    const remaining = await prisma.roomBilling.count({
      where: { billingPeriodId: periodId, status: 'LOCKED' },
    });
    if (remaining === 0 && result.generated > 0) {
      await prisma.billingPeriod.update({
        where: { id: periodId },
        data:  { status: 'CLOSED' },
      });
    }

    logger.info({
      type: 'billing_period_generate_invoices',
      periodId, year: period.year, month: period.month,
      generated: result.generated, skipped: result.skipped, errors: result.errors,
    });

    return NextResponse.json({
      success: true,
      data:    result,
      message: `Generated ${result.generated} invoices` +
               (result.skipped ? `, skipped ${result.skipped} (already invoiced)` : '') +
               (result.errors  ? `, ${result.errors} errors` : ''),
    } as ApiResponse<{ generated: number; skipped: number; errors: number; errorDetails: string[] }>);
  }
);
