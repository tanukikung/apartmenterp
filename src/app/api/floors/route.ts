import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireOperator } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireOperator(req);
  // Floor model removed; derive distinct floors from Room.floorNo
  const rooms = await prisma.room.findMany({
    select: { floorNo: true },
    distinct: ['floorNo'],
    orderBy: { floorNo: 'asc' },
  });

  const floors = rooms.map((r) => ({
    floorNo: r.floorNo,
    label: `ชั้น ${r.floorNo}`,
  }));

  return NextResponse.json({
    success: true,
    data: floors,
  } as ApiResponse<typeof floors>);
});
