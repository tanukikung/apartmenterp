import { NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';

type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: OccupancyData; expiry: number } | null = null;

export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const now = Date.now();
  if (cache && cache.expiry > now) {
    return NextResponse.json({ success: true, data: cache.value } as ApiResponse<OccupancyData>);
  }

  const [totalRooms, occupiedRooms, vacantRooms] = await Promise.all([
    prisma.room.count(),
    // ACTIVE rooms with current tenants are considered occupied
    prisma.room.count({ where: { roomStatus: 'ACTIVE', tenants: { some: { moveOutDate: null } } } }),
    prisma.room.count({ where: { tenants: { none: { moveOutDate: null } } } }),
  ]);

  const value: OccupancyData = { totalRooms, occupiedRooms, vacantRooms };
  cache = { value, expiry: now + CACHE_TTL_MS };
  return NextResponse.json({ success: true, data: value } as ApiResponse<OccupancyData>);
});
