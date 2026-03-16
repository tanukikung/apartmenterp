import { NextRequest, NextResponse } from 'next/server';
import { getBillingService } from '@/modules/billing/billing.service';
import {
  createBillingRecordSchema,
  listBillingRecordsQuerySchema,
} from '@/modules/billing/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/billing - List billing records
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url);
  
  const query = {
    roomId: url.searchParams.get('roomId') || undefined,
    year: url.searchParams.get('year') || undefined,
    month: url.searchParams.get('month') || undefined,
    status: url.searchParams.get('status') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '20',
    sortBy: url.searchParams.get('sortBy') || 'createdAt',
    sortOrder: url.searchParams.get('sortOrder') || 'desc',
  };

  const validatedQuery = listBillingRecordsQuerySchema.parse(query);

  const billingService = getBillingService();
  const result = await billingService.listBillingRecords(validatedQuery);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// ============================================================================
// POST /api/billing - Create billing record
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json();

  const input = createBillingRecordSchema.parse(body);

  const billingService = getBillingService();
  const record = await billingService.createBillingRecord(input);

  logger.info({
    type: 'billing_created_api',
    billingRecordId: record.id,
    roomId: record.roomId,
    year: record.year,
    month: record.month,
  });

  return NextResponse.json({
    success: true,
    data: record,
    message: 'Billing record created successfully',
  } as ApiResponse<typeof record>, { status: 201 });
});
