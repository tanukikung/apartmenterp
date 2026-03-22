import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { renewContractSchema } from '@/modules/contracts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// POST /api/contracts/[id]/renew - Renew a contract
// ============================================================================

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json();

    const input = renewContractSchema.parse(body);

    const { contractService } = getServiceContainer();
    const contract = await contractService.renewContract(id, input);

    logger.info({
      type: 'contract_renewed_api',
      contractId: contract.id,
      newEndDate: input.newEndDate,
    });

    return NextResponse.json({
      success: true,
      data: contract,
      message: 'Contract renewed successfully',
    } as ApiResponse<typeof contract>);
  }
);
