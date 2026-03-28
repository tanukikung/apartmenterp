import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import {
  createContractSchema,
  listContractsQuerySchema,
} from '@/modules/contracts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/contracts - List all contracts
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
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
  requireRole(req, ['ADMIN']);
  const body = await req.json();

  const input = createContractSchema.parse(body);

  const { contractService } = getServiceContainer();
  const contract = await contractService.createContract(input);

  logger.info({
    type: 'contract_created_api',
    contractId: contract.id,
    roomNo: contract.roomNo,
  });

  return NextResponse.json({
    success: true,
    data: contract,
    message: 'Contract created successfully',
  } as ApiResponse<typeof contract>, { status: 201 });
});
