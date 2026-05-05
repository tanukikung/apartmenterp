import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { listInvoicesQuerySchema, generateInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse, formatError, AppError, ConflictError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireOperator, requireRole } from '@/lib/auth/guards';
import { logAudit } from '@/modules/audit';
import { requireMutationsAllowed } from '@/lib/guards/system';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/invoices - List invoices
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  await await requireOperator(req);
  const url = new URL(req.url);

  const query = {
    q: url.searchParams.get('q') || undefined,
    roomId: url.searchParams.get('roomId') || undefined,
    billingCycleId: url.searchParams.get('billingCycleId') || undefined,
    year: url.searchParams.get('year') || undefined,
    month: url.searchParams.get('month') || undefined,
    status: url.searchParams.get('status') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '20',
    sortBy: url.searchParams.get('sortBy') || 'createdAt',
    sortOrder: url.searchParams.get('sortOrder') || 'desc',
  };

  const validatedQuery = listInvoicesQuerySchema.parse(query);

  const { invoiceService } = getServiceContainer();
  const result = await invoiceService.listInvoices(validatedQuery);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// ============================================================================
// POST /api/invoices/generate - Generate invoice from billing
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const blocked = await requireMutationsAllowed();
  if (blocked) return blocked;

  const session = await await requireRole(req);
  const url = new URL(req.url);

  // Check if this is a generate request
  if (url.pathname.endsWith('/generate')) {
    const body = await req.json();
    const input = generateInvoiceSchema.parse(body);

    const { invoiceService, billingService } = getServiceContainer();

    // Step 1: Lock the billing record.
    // If this succeeds but step 2 fails, we rollback by unlocking so the
    // billing record is not left in LOCKED state with no invoice.
    await billingService.lockBillingRecord(input.billingRecordId, { force: false });

    try {
      // Step 2: Generate the invoice inside its own transaction.
      // The SELECT FOR UPDATE on roomBilling inside generateInvoiceFromBilling
      // will block if another request is already generating for this billing
      // record. The roomBillingId unique constraint prevents duplicate invoices.
      const invoice = await invoiceService.generateInvoiceFromBilling(input.billingRecordId);

      await logAudit({
        actorId: session.sub,
        actorRole: 'ADMIN',
        action: 'INVOICE_GENERATED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { roomNo: invoice.roomNo, year: invoice.year, month: invoice.month },
      });

      logger.info({
        type: 'invoice_generated_api',
        invoiceId: invoice.id,
        billingRecordId: input.billingRecordId,
      });

      return NextResponse.json({
        success: true,
        data: invoice,
        message: 'Invoice generated successfully',
      } as ApiResponse<typeof invoice>, { status: 201 });
    } catch (err) {
      // Rollback: unlock the billing record so it is not orphaned in LOCKED state
      try {
        await billingService.unlockBillingRecord(input.billingRecordId, session.sub);
      } catch {
        // Unlock failure is non-fatal — the billing will still be in LOCKED
        // but the invoice was not created, so manual recovery is needed.
        // Log but don't throw — surface the original error.
        logger.error({ type: 'invoice_gen_rollback_failed', billingRecordId: input.billingRecordId });
      }
      throw err;
    }
  }

  return NextResponse.json(
    formatError(new AppError('Invalid endpoint', 'NOT_FOUND', 404)),
    { status: 404 }
  );
});