import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { terminateContractSchema } from '@/modules/contracts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireRole } from '@/lib/auth/guards';

// ============================================================================
// POST /api/contracts/[id]/terminate - Terminate a contract
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN']);
    const { id } = params;
    const body = await req.json();

    const input = terminateContractSchema.parse(body);

    const { contractService } = getServiceContainer();
    const contract = await contractService.terminateContract(id, input);

    logger.info({
      type: 'contract_terminated_api',
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
