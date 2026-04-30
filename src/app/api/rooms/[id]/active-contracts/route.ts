import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, NotFoundError } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { requireRole } from '@/lib/auth/guards';

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const roomNo = params.id;

    const room = await prisma.room.findUnique({ where: { roomNo } });
    if (!room) throw new NotFoundError('Room', roomNo);

    // Find active contracts for this room
    const activeContracts = await prisma.contract.findMany({
      where: {
        roomNo,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        primaryTenantId: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: activeContracts,
    });
  },
);