import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import {
  createBillingRecordSchema,
  listBillingRecordsQuerySchema,
} from '@/modules/billing/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireAuthSession, requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/billing - List billing records
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);
  const url = new URL(req.url);
  
  const query = {
    roomNo: url.searchParams.get('roomNo') || undefined,
    billingPeriodId: url.searchParams.get('billingPeriodId') || undefined,
    year: url.searchParams.get('year') || undefined,
    month: url.searchParams.get('month') || undefined,
    status: url.searchParams.get('status') || undefined,
    floor: url.searchParams.get('floor') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '50',
    sortBy: url.searchParams.get('sortBy') || 'roomNo',
    sortOrder: url.searchParams.get('sortOrder') || 'asc',
  };

  const validatedQuery = listBillingRecordsQuerySchema.parse(query);

  const { billingService } = getServiceContainer();
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
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = await req.json();

  const input = createBillingRecordSchema.parse(body);

  const { billingService } = getServiceContainer();
  const record = await billingService.createBillingRecord(input);

  logger.info({
    type: 'billing_created_api',
    billingRecordId: record.id,
    roomNo: record.roomNo,
    year: record.year,
    month: record.month,
  });

  return NextResponse.json({
    success: true,
    data: record,
    message: 'Billing record created successfully',
  } as ApiResponse<typeof record>, { status: 201 });
});
