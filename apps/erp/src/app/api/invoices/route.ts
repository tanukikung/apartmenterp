import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceService } from '@/modules/invoices/invoice.service';
import { listInvoicesQuerySchema, generateInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse, formatError, AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/invoices - List invoices
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url);
  
  const query = {
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

  const invoiceService = getInvoiceService();
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
  const url = new URL(req.url);
  
  // Check if this is a generate request
  if (url.pathname.endsWith('/generate')) {
    const body = await req.json();
    const input = generateInvoiceSchema.parse(body);
    const confirm = url.searchParams.get('confirm') === 'true';

    const invoiceService = getInvoiceService();
    const invoice = confirm
      ? await invoiceService.generateInvoice(input)
      : await invoiceService.generateInvoiceFromBilling(input.billingRecordId);

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
