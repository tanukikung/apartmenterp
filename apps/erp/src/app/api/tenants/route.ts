import { NextRequest, NextResponse } from 'next/server';
import { getTenantService } from '@/modules/tenants/tenant.service';
import {
  createTenantSchema,
  listTenantsQuerySchema,
} from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/tenants - List all tenants
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
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

  const tenantService = getTenantService();
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
  const body = await req.json();

  const input = createTenantSchema.parse(body);

  const tenantService = getTenantService();
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
