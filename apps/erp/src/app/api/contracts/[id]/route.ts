import { NextRequest, NextResponse } from 'next/server';
import { getContractService } from '@/modules/contracts/contract.service';
import { updateContractSchema } from '@/modules/contracts/types';
import { asyncHandler, ApiResponse, formatError, AppError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// GET /api/contracts/[id] - Get contract by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;

    const contractService = getContractService();
    const contract = await contractService.getContractById(id);

    return NextResponse.json({
      success: true,
      data: contract,
    } as ApiResponse<typeof contract>);
  }
);

// ============================================================================
// PATCH /api/contracts/[id] - Update contract
// ============================================================================

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json();

    const input = updateContractSchema.parse(body);

    const contractService = getContractService();
    const contract = await contractService.updateContract(id, input);

    logger.info({
      type: 'contract_updated_api',
      contractId: contract.id,
    });

    return NextResponse.json({
      success: true,
      data: contract,
      message: 'Contract updated successfully',
    } as ApiResponse<typeof contract>);
  }
);

// ============================================================================
// DELETE /api/contracts/[id] - Delete contract
// ============================================================================

export const DELETE = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    logger.info({
      type: 'contract_delete_not_implemented',
      contractId: id,
    });

    return NextResponse.json(
      formatError(new AppError('Delete not implemented', 'NOT_IMPLEMENTED', 501)),
      { status: 501 }
    );
  }
);
