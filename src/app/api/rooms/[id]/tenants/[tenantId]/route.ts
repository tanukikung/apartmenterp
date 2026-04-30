import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { removeTenantSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

// ============================================================================
// DELETE /api/rooms/[id]/tenants/[tenantId] - Remove tenant from room
// ============================================================================

export const DELETE = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string; tenantId: string } }
  ): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`rooms-tenant-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    requireRole(req, ['ADMIN', 'OWNER']);
    const { id: roomId, tenantId } = params;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
        { status: 400 }
      );
    }

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
