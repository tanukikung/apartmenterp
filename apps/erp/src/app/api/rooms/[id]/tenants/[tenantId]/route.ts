import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { removeTenantSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// DELETE /api/rooms/[id]/tenants/[tenantId] - Remove tenant from room
// ============================================================================

export const DELETE = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string; tenantId: string } }
  ): Promise<NextResponse> => {
    const { id: roomId, tenantId } = params;
    const body = await req.json().catch(() => ({}));

    // Default to today if no moveOutDate provided
    const input = removeTenantSchema.parse({
      moveOutDate: body.moveOutDate || new Date().toISOString().split('T')[0],
    });

    const { tenantService } = getServiceContainer();
    await tenantService.removeTenantFromRoom(roomId, tenantId, input);

    logger.info({
      type: 'tenant_removed_api',
      roomId,
      tenantId,
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: 'Tenant removed from room successfully',
    } as ApiResponse<null>);
  }
);
