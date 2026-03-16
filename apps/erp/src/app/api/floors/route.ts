import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const floors = await prisma.floor.findMany({
    include: {
      building: true,
    },
    orderBy: [
      { building: { name: 'asc' } },
      { floorNumber: 'asc' },
    ],
  });

  return NextResponse.json({
    success: true,
    data: floors.map((floor) => ({
      id: floor.id,
      floorNumber: floor.floorNumber,
      buildingId: floor.buildingId,
      buildingName: floor.building.name,
    })),
  } as ApiResponse<unknown>);
});
