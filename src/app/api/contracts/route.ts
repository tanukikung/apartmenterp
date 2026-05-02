import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import {
  createContractSchema,
  listContractsQuerySchema,
} from '@/modules/contracts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole, requireBuildingAccess } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/contracts - List all contracts
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const url = new URL(req.url);
  
  const query = {
    roomId: url.searchParams.get('roomId') || undefined,
    tenantId: url.searchParams.get('tenantId') || undefined,
    status: url.searchParams.get('status') || undefined,
    expiringBefore: url.searchParams.get('expiringBefore') || undefined,
    expiringAfter: url.searchParams.get('expiringAfter') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '20',
    sortBy: url.searchParams.get('sortBy') || 'createdAt',
    sortOrder: url.searchParams.get('sortOrder') || 'desc',
  };

  const validatedQuery = listContractsQuerySchema.parse(query);

  const { contractService } = getServiceContainer();
  const result = await contractService.listContracts(validatedQuery);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// ============================================================================
// POST /api/contracts - Create a new contract
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  requireBuildingAccess(session, null);

  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`contracts:${session.sub}:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const requestId = req.headers.get('x-request-id') ?? undefined;
  const body = await req.json();

  const input = createContractSchema.parse(body);

  const { contractService } = getServiceContainer();
  const contract = await contractService.createContract(input, session.sub, requestId);

  logger.info({
    type: 'contract_created_api',
    requestId: requestId ?? null,
    actorId: session.sub,
    contractId: contract.id,
    roomNo: contract.roomNo,
  });

  return NextResponse.json({
    success: true,
    data: contract,
    message: 'Contract created successfully',
  } as ApiResponse<typeof contract>, { status: 201 });
});
