import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { updateTenantSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';

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
    const session = requireRole(req, ['ADMIN']);

    const { tenantService } = getServiceContainer();
    await tenantService.deleteTenant(id, session.sub);

    await logAudit({
      actorId: session.sub,
      actorRole: session.role,
      action: 'TENANT_DELETED',
      entityType: 'TENANT',
      entityId: id,
    });

    logger.info({ type: 'tenant_deleted_api', tenantId: id, actorId: session.sub });

    return NextResponse.json({
      success: true,
      data: { id },
      message: 'Tenant deleted successfully',
    } as ApiResponse<{ id: string }>);
  }
);
