import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { updateTenantSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse, formatError, AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// GET /api/tenants/[id] - Get tenant by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF']);
    const { id } = params;

    const { tenantService } = getServiceContainer();
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
    requireRole(req, ['ADMIN']);
    const { id } = params;
    const body = await req.json();

    const input = updateTenantSchema.parse(body);

    const { tenantService } = getServiceContainer();
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

    const { tenantService } = getServiceContainer();
    
    // Check if tenant exists first
    await tenantService.getTenantById(id);

    // Delete is not implemented to prevent accidental data loss.
    // Tenants have active relationships (RoomTenants, Invoices, Payments).
    // If deletion is needed, implement soft-delete or proper relationship cleanup first.
    return NextResponse.json(
      formatError(new AppError('Delete not implemented', 'NOT_IMPLEMENTED', 501)),
      { status: 501 }
    );
  }
);
