import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { getTenantService } from '@/modules/tenants/tenant.service';
import { updateTenantSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse, formatError, AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// GET /api/tenants/[id] - Get tenant by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;

    const tenantService = getTenantService();
    const tenant = await tenantService.getTenantById(id);

    return NextResponse.json({
      success: true,
      data: tenant,
    } as ApiResponse<typeof tenant>);
  }
);

// ============================================================================
// PATCH /api/tenants/[id] - Update tenant
// ============================================================================

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json();

    const input = updateTenantSchema.parse(body);

    const tenantService = getTenantService();
    const tenant = await tenantService.updateTenant(id, input);

    logger.info({
      type: 'tenant_updated_api',
      tenantId: tenant.id,
      fullName: tenant.fullName,
    });

    return NextResponse.json({
      success: true,
      data: tenant,
      message: 'Tenant updated successfully',
    } as ApiResponse<typeof tenant>);
  }
);

// ============================================================================
// DELETE /api/tenants/[id] - Delete tenant
// ============================================================================

export const DELETE = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    requireRole(req, ['ADMIN']);

    const tenantService = getTenantService();
    
    // Check if tenant exists first
    await tenantService.getTenantById(id);
    
    // TODO: Add delete logic if needed (with proper checks for active relationships)
    // For now, just return not implemented
    return NextResponse.json(
      formatError(new AppError('Delete not implemented', 'NOT_IMPLEMENTED', 501)),
      { status: 501 }
    );
  }
);
