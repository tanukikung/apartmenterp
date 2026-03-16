import { NextRequest, NextResponse } from 'next/server';
import { getContractService } from '@/modules/contracts/contract.service';
import { terminateContractSchema } from '@/modules/contracts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/contracts/[id]/terminate - Terminate a contract
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json();

    const input = terminateContractSchema.parse(body);

    const contractService = getContractService();
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
