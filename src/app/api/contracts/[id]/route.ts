import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { updateContractSchema, terminateContractSchema } from '@/modules/contracts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/contracts/[id] - Get contract by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

    const { id } = params;

    const { contractService } = getServiceContainer();
    const contract = await contractService.getContractById(id);

    return NextResponse.json({
      success: true,
      data: contract,
    } as ApiResponse<typeof contract>);
  }
);

// ============================================================================
// PATCH /api/contracts/[id] - Update contract fields
// ============================================================================

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN', 'OWNER']);

    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`contracts-patch:${session.sub}:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }

    const { id } = params;
    const body = await req.json();

    const input = updateContractSchema.parse(body);

    const { contractService } = getServiceContainer();
    const contract = await contractService.updateContract(id, input);

    logger.info({
      type: 'contract_updated_api',
      contractId: contract.id,
      actorId: session.sub,
    });

    await logAudit({
      req,
      action: 'CONTRACT_UPDATED',
      entityType: 'Contract',
      entityId: contract.id,
      metadata: {
        roomNo: contract.roomNo,
        changes: input,
      },
    });

    return NextResponse.json({
      success: true,
      data: contract,
      message: 'Contract updated successfully',
    } as ApiResponse<typeof contract>);
  }
);

// ============================================================================
// DELETE /api/contracts/[id] - Terminate contract
// ============================================================================

export const DELETE = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN', 'OWNER']);

    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`contracts-delete:${session.sub}:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }

    const { id } = params;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
        { status: 400 }
      );
    }

    const input = terminateContractSchema.parse(body);

    const { contractService } = getServiceContainer();
    const contract = await contractService.terminateContract(id, input, session.sub);

    logger.info({
      type: 'contract_terminated_api',
      contractId: contract.id,
      actorId: session.sub,
      terminationDate: input.terminationDate,
    });

    await logAudit({
      req,
      action: 'CONTRACT_TERMINATED',
      entityType: 'Contract',
      entityId: contract.id,
      metadata: {
        roomNo: contract.roomNo,
        terminationDate: input.terminationDate,
        terminationReason: input.terminationReason,
      },
    });

    return NextResponse.json({
      success: true,
      data: contract,
      message: 'Contract terminated successfully',
    } as ApiResponse<typeof contract>);
  }
);
