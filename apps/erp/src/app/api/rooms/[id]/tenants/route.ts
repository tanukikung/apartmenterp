import { NextRequest, NextResponse } from 'next/server';
import { getTenantService } from '@/modules/tenants/tenant.service';
import { assignTenantSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/rooms/[id]/tenants - Assign tenant to room
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id: roomId } = params;
    const body = await req.json();

    const input = assignTenantSchema.parse(body);

    const tenantService = getTenantService();
    const roomTenant = await tenantService.assignTenantToRoom(roomId, input);

    logger.info({
      type: 'tenant_assigned_api',
      roomId,
      tenantId: input.tenantId,
      role: input.role,
    });

    return NextResponse.json({
      success: true,
      data: roomTenant,
      message: 'Tenant assigned to room successfully',
    } as ApiResponse<typeof roomTenant>, { status: 201 });
  }
);

// ============================================================================
// GET /api/rooms/[id]/tenants - Get tenants in a room
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id: roomId } = params;

    const tenantService = getTenantService();
    const tenants = await tenantService.getTenantsByRoom(roomId);

    return NextResponse.json({
      success: true,
      data: tenants,
    } as ApiResponse<typeof tenants>);
  }
);
