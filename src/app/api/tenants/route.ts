import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import {
  createTenantSchema,
  listTenantsQuerySchema,
} from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireOperator } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/tenants - List all tenants
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireOperator(req);
  const url = new URL(req.url);
  
  const query = {
    roomId: url.searchParams.get('roomId') || undefined,
    lineUserId: url.searchParams.get('lineUserId') || undefined,
    search: url.searchParams.get('search') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '20',
    sortBy: url.searchParams.get('sortBy') || 'createdAt',
    sortOrder: url.searchParams.get('sortOrder') || 'asc',
  };

  const validatedQuery = listTenantsQuerySchema.parse(query);

  const { tenantService } = getServiceContainer();
  const result = await tenantService.listTenants(validatedQuery);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// ============================================================================
// POST /api/tenants - Create a new tenant
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`tenants:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
  const body = await req.json();

  const input = createTenantSchema.parse(body);

  const { tenantService } = getServiceContainer();
  const tenant = await tenantService.createTenant(input);

  logger.info({
    type: 'tenant_created_api',
    tenantId: tenant.id,
    fullName: tenant.fullName,
  });

  return NextResponse.json({
    success: true,
    data: tenant,
    message: 'Tenant created successfully',
  } as ApiResponse<typeof tenant>, { status: 201 });
});
