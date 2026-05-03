import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { terminateContractSchema } from '@/modules/contracts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole } from '@/lib/auth/guards';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

// ============================================================================
// POST /api/contracts/[id]/terminate - Terminate a contract
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`contracts-terminate:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    const requestId = req.headers.get('x-request-id') ?? undefined;
    const session = requireRole(req, ['ADMIN', 'OWNER']);
    const { id } = params;
    const body = await req.json();

    const input = terminateContractSchema.parse(body);

    const { contractService } = getServiceContainer();
    const contract = await contractService.terminateContract(id, input, session.sub, requestId);

    await logAudit({ req, action: 'CONTRACT_TERMINATED', entityType: 'Contract', entityId: contract.id, metadata: { ...input } });

    logger.info({
      type: 'contract_terminated_api',
      requestId,
      contractId: contract.id,
      terminationDate: input.terminationDate,
    });

    return NextResponse.json({
      success: true,
      data: contract,
      message: 'Contract terminated successfully',
    } as ApiResponse<typeof contract>);
  }
);
