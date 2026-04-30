import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { assignTenantSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ============================================================================
// POST /api/rooms/[id]/tenants - Assign tenant to room
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`rooms-tenants:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const { id: roomId } = params;
    const body = await req.json();

    const input = assignTenantSchema.parse(body);

    const { tenantService } = getServiceContainer();
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
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const { id: roomId } = params;

    const { tenantService } = getServiceContainer();
    const tenants = await tenantService.getTenantsByRoom(roomId);

    return NextResponse.json({
      success: true,
      data: tenants,
    } as ApiResponse<typeof tenants>);
  }
);
