import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { requireRole } from '@/lib/auth/guards';

type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
  ownerUseRooms: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: OccupancyData; expiry: number } | null = null;

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);
  const now = Date.now();
  if (cache && cache.expiry > now) {
    return NextResponse.json({ success: true, data: cache.value } as ApiResponse<OccupancyData>);
  }

  // Use the canonical room status so dashboard/report totals stay aligned.
  const [totalRooms, occupiedRooms, vacantRooms, maintenanceRooms, ownerUseRooms] = await Promise.all([
    prisma.room.count(),
    prisma.room.count({ where: { roomStatus: 'OCCUPIED' } }),
    prisma.room.count({ where: { roomStatus: 'VACANT' } }),
    prisma.room.count({ where: { roomStatus: 'MAINTENANCE' } }),
    prisma.room.count({ where: { roomStatus: 'OWNER_USE' } }),
  ]);

  const value: OccupancyData = { totalRooms, occupiedRooms, vacantRooms, maintenanceRooms, ownerUseRooms };
  cache = { value, expiry: now + CACHE_TTL_MS };
  return NextResponse.json({ success: true, data: value } as ApiResponse<OccupancyData>);
});
