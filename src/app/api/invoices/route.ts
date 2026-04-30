import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { listInvoicesQuerySchema, generateInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse, formatError, AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole } from '@/lib/auth/guards';
import { logAudit } from '@/modules/audit';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/invoices - List invoices
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);
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
  const session = requireRole(req);
  const url = new URL(req.url);

  // Check if this is a generate request
  if (url.pathname.endsWith('/generate')) {
    const body = await req.json();
    const input = generateInvoiceSchema.parse(body);

    const { invoiceService, billingService } = getServiceContainer();
    // Lock the billing record first, then generate the invoice
    await billingService.lockBillingRecord(input.billingRecordId, { force: false });
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
  }

  return NextResponse.json(
    formatError(new AppError('Invalid endpoint', 'NOT_FOUND', 404)),
    { status: 404 }
  );
});
