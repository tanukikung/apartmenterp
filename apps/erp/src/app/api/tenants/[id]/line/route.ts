import { NextRequest, NextResponse } from 'next/server';
import { getTenantService } from '@/modules/tenants/tenant.service';
import { linkLineAccountSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/tenants/[id]/line - Link LINE account to tenant
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json();

    const input = linkLineAccountSchema.parse(body);

    const tenantService = getTenantService();
    const tenant = await tenantService.linkLineAccount(id, input);

    logger.info({
      type: 'tenant_line_linked_api',
      tenantId: id,
      lineUserId: input.lineUserId,
    });

    return NextResponse.json({
      success: true,
      data: tenant,
      message: 'LINE account linked successfully',
    } as ApiResponse<typeof tenant>);
  }
);
