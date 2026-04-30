import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import {
  createBillingRecordSchema,
  listBillingRecordsQuerySchema,
} from '@/modules/billing/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireAuthSession, requireRole } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { logAudit } from '@/modules/audit';

export const dynamic = 'force-dynamic';

// Billing write operations: 10/min
const BILLING_WINDOW_MS = 60 * 1000;
const BILLING_MAX_ATTEMPTS = 10;

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
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`billing:${ip}`, BILLING_MAX_ATTEMPTS, BILLING_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many billing requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }

  const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const body = await req.json();

  const input = createBillingRecordSchema.parse(body);

  const { billingService } = getServiceContainer();
  const record = await billingService.createBillingRecord(input);

  await logAudit({
    actorId: session.sub,
    actorRole: 'ADMIN',
    action: 'BILLING_RECORD_CREATED',
    entityType: 'RoomBilling',
    entityId: record.id,
    metadata: { roomNo: record.roomNo, year: record.year, month: record.month },
  });

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
