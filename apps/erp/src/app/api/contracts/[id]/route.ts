import { NextRequest, NextResponse } from 'next/server';
import { getContractService } from '@/modules/contracts/contract.service';
import { updateContractSchema, terminateContractSchema } from '@/modules/contracts/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getRequestIp } from '@/lib/auth/guards';
import { logger } from '@/lib/utils/logger';
import { logAudit } from '@/modules/audit/audit.service';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/contracts/[id] - Get contract by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF']);

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
// PATCH /api/contracts/[id] - Update contract fields
// ============================================================================

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const session = requireRole(req, ['ADMIN']);

    const { id } = params;
    const body = await req.json();

    const input = updateContractSchema.parse(body);

    const contractService = getContractService();
    const contract = await contractService.updateContract(id, input);

    logger.info({
      type: 'contract_updated_api',
      contractId: contract.id,
      actorId: session.sub,
    });

    await logAudit({
      actorId: session.sub,
      actorRole: session.role,
      action: 'CONTRACT_UPDATED',
      entityType: 'Contract',
      entityId: contract.id,
      metadata: {
        roomNo: contract.roomNo,
        changes: input,
      },
      ipAddress: getRequestIp(req),
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
    const session = requireRole(req, ['ADMIN']);

    const { id } = params;
    const body = await req.json().catch(() => ({}));

    const input = terminateContractSchema.parse(body);

    const contractService = getContractService();
    const contract = await contractService.terminateContract(id, input, session.sub);

    logger.info({
      type: 'contract_terminated_api',
      contractId: contract.id,
      actorId: session.sub,
      terminationDate: input.terminationDate,
    });

    await logAudit({
      actorId: session.sub,
      actorRole: session.role,
      action: 'CONTRACT_TERMINATED',
      entityType: 'Contract',
      entityId: contract.id,
      metadata: {
        roomNo: contract.roomNo,
        terminationDate: input.terminationDate,
        terminationReason: input.terminationReason,
      },
      ipAddress: getRequestIp(req),
    });

    return NextResponse.json({
      success: true,
      data: contract,
      message: 'Contract terminated successfully',
    } as ApiResponse<typeof contract>);
  }
);
