import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { requireRole } from '@/lib/auth/guards';

type FloorOccupancy = {
  floorNumber: number;
  total: number;
  occupied: number;
  vacant: number;
  maintenance: number;
  occupancyRate: number;
};

type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  // New canonical key used by the Reports page. Kept alongside maintenanceRooms
  // for backwards compatibility with any existing consumers.
  maintenance: number;
  maintenanceRooms: number;
  selfUse: number;
  unavailable: number;
  occupancyRate: number;
  byFloor: FloorOccupancy[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: OccupancyData; expiry: number } | null = null;

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);
  const now = Date.now();
  if (cache && cache.expiry > now) {
    return NextResponse.json({ success: true, data: cache.value } as ApiResponse<OccupancyData>);
  }

  // Use roomStatus as source of truth — matches what the /admin/rooms page displays
  // so all counters across the UI stay consistent.
  // We fetch every room in a single query (no pagination cap) so the by-floor
  // breakdown is complete for all 363 rooms, not just the first page.
  const [totalRooms, occupiedRooms, vacantRooms, maintenanceRooms, ownerUseRooms, allRooms] = await Promise.all([
    prisma.room.count(),
    prisma.room.count({ where: { roomStatus: 'OCCUPIED' } }),
    prisma.room.count({ where: { roomStatus: 'VACANT' } }),
    prisma.room.count({ where: { roomStatus: 'MAINTENANCE' } }),
    prisma.room.count({ where: { roomStatus: 'OWNER_USE' } }).catch(() => 0),
    prisma.room.findMany({
      select: { roomStatus: true, floorNo: true },
    }),
  ]);

  // Group rooms by floor for the Reports → Occupancy tab.
  const floorMap = new Map<number, FloorOccupancy>();
  for (const room of allRooms) {
    const floorNumber = room.floorNo ?? 0;
    if (!floorMap.has(floorNumber)) {
      floorMap.set(floorNumber, { floorNumber, total: 0, occupied: 0, vacant: 0, maintenance: 0, occupancyRate: 0 });
    }
    const entry = floorMap.get(floorNumber)!;
    entry.total++;
    if (room.roomStatus === 'OCCUPIED') entry.occupied++;
    else if (room.roomStatus === 'VACANT') entry.vacant++;
    else if (room.roomStatus === 'MAINTENANCE') entry.maintenance++;
  }
  const byFloor: FloorOccupancy[] = Array.from(floorMap.values())
    .sort((a, b) => a.floorNumber - b.floorNumber)
    .map((f) => ({ ...f, occupancyRate: f.total > 0 ? Math.round((f.occupied / f.total) * 100) : 0 }));

  const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const value: OccupancyData = {
    totalRooms,
    occupiedRooms,
    vacantRooms,
    maintenance: maintenanceRooms,
    maintenanceRooms,
    selfUse: ownerUseRooms,
    unavailable: 0,
    occupancyRate,
    byFloor,
  };
  cache = { value, expiry: now + CACHE_TTL_MS };
  return NextResponse.json({ success: true, data: value } as ApiResponse<OccupancyData>);
});
