import { NextRequest, NextResponse } from 'next/server';
import { getBillingService } from '@/modules/billing/billing.service';
import { parseBillingWorkbook } from '@/modules/billing/import-parser';
import { executeBillingImportBatch } from '@/modules/billing/import-batch.service';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({})) as { batchId?: string };
    if (!body.batchId) {
      return NextResponse.json(
        { success: false, error: { name: 'BadRequest', message: 'Missing batchId', code: 'BAD_REQUEST', statusCode: 400 } },
        { status: 400 },
      );
    }

    const result = await executeBillingImportBatch(body.batchId);
    return NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<typeof result>);
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Missing file', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const parsed = parseBillingWorkbook(new Uint8Array(arrayBuffer));

  const billingService = getBillingService();
  const result = await billingService.importBillingRows(parsed);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
