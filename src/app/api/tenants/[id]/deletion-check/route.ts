import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/client';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const { id } = params;

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            contracts: true,
            roomTenants: { where: { moveOutDate: null } },
          },
        },
        contracts: {
          where: { status: 'ACTIVE' },
          include: { room: { select: { roomNo: true } } },
          take: 5,
        },
        roomTenants: {
          where: { moveOutDate: null },
          include: { room: { select: { roomNo: true } } },
          take: 5,
        },
      },
    });

    if (!tenant) {
      return NextResponse.json(
        {
          success: false,
          error: { name: 'NotFound', message: 'ไม่พบผู้เช่า', code: 'NOT_FOUND', statusCode: 404 },
        },
        { status: 404 }
      );
    }

    const blockers: string[] = [];

    if (tenant._count.contracts > 0) {
      const activeContracts = tenant.contracts.filter((c) => c.status === 'ACTIVE');
      for (const c of activeContracts) {
        blockers.push(`มีสัญญา ACTIVE ในห้อง ${c.room?.roomNo ?? '?'} — ต้องยกเลิกสัญญาก่อน`);
      }
    }

    if (tenant._count.roomTenants > 0) {
      const activeAssignments = tenant.roomTenants.filter((rt) => rt.moveOutDate === null);
      for (const rt of activeAssignments) {
        blockers.push(`ผู้เช่ายังอยู่ในห้อง ${rt.room?.roomNo ?? '?'} — ต้องย้ายออกก่อน`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        deletable: blockers.length === 0,
        blockers,
      },
    } as ApiResponse<{ deletable: boolean; blockers: string[] }>);
  }
);