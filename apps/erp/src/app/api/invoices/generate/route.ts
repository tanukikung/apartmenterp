import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { generateInvoiceSchema } from '@/modules/invoices/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/invoices/generate - Generate invoice from billing
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json();
  const input = generateInvoiceSchema.parse(body);
  const { searchParams } = new URL(req.url);
  const confirm = searchParams.get('confirm') === 'true';

  const { invoiceService } = getServiceContainer();
  let invoice;
  if (confirm) {
    invoice = await invoiceService.generateInvoice(input);
  } else {
    invoice = await invoiceService.generateInvoiceFromBilling(input.billingRecordId);
  }

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
});
