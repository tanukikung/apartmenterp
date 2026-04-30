import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { getServiceContainer } from '@/lib/service-container';
import { updateTenantSchema } from '@/modules/tenants/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

// ============================================================================
// GET /api/tenants/[id] - Get tenant by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
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
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`tenants-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    requireRole(req, ['ADMIN', 'OWNER']);
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
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`tenants-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    const { id } = params;
    const session = requireRole(req, ['ADMIN', 'OWNER']);

    const { tenantService } = getServiceContainer();
    await tenantService.deleteTenant(id, session.sub);

    await logAudit({
      req,
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
