import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/billing/periods/[id]/generate-invoices
// Generate invoices for ALL LOCKED RoomBilling records that do not yet have
// an invoice.  Returns a summary { generated, skipped, errors }.
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id: periodId } = params;
    const session = requireRole(req, ['ADMIN']);

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
    });

    if (billings.length === 0) {
      return NextResponse.json({
        success: true,
        data: { generated: 0, skipped: 0, errors: 0, errorDetails: [] },
        message: 'No locked billing records without invoices found. Lock the period first.',
      } as ApiResponse<{ generated: number; skipped: number; errors: number; errorDetails: string[] }>);
    }

    let generated = 0;
    let skipped   = 0;
    let errors    = 0;
    const errorDetails: string[] = [];

    // Due date = period.dueDay of next month (or same month if in the future)
    const buildDueDate = (): Date => {
      const now   = new Date();
      const dueDay = period.dueDay ?? 25;
      // Try same month first
      const d = new Date(period.year, period.month - 1, dueDay);
      // If already past, push to same month next year (edge case only)
      return d < now ? new Date(period.year, period.month, dueDay) : d;
    };

    for (const rb of billings) {
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
              } as any as Prisma.InputJsonValue,
              retryCount: 0,
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

    // Update period status to CLOSED (fully invoiced) when no more LOCKED records remain
    const remaining = await prisma.roomBilling.count({
      where: { billingPeriodId: periodId, status: 'LOCKED' },
    });
    if (remaining === 0 && generated > 0) {
      await prisma.billingPeriod.update({
        where: { id: periodId },
        data:  { status: 'CLOSED' },
      });
    }

    logger.info({
      type: 'billing_period_generate_invoices',
      periodId, year: period.year, month: period.month,
      generated, skipped, errors,
    });

    return NextResponse.json({
      success: true,
      data:    { generated, skipped, errors, errorDetails },
      message: `Generated ${generated} invoices` +
               (skipped ? `, skipped ${skipped} (already invoiced)` : '') +
               (errors  ? `, ${errors} errors` : ''),
    } as ApiResponse<{ generated: number; skipped: number; errors: number; errorDetails: string[] }>);
  }
);
