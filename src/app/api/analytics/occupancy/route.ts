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
  maintenance: number;
  maintenanceRooms: number;
  selfUse: number;
  unavailable: number;
  occupancyRate: number;
  byFloor: FloorOccupancy[];
};

// CACHE LIMITATION (multi-worker): This module-level cache is per-worker-process.
// It will NOT stay in sync across multiple Next.js workers/replicas.
// Data may be stale for up to CACHE_TTL_MS in containerized deployments.
// To invalidate: call invalidateOccupancyCache() from @/lib/cache/occupancy after
// room status changes. For multi-replica production, use Redis instead.
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
  // Single findMany fetches all rooms; aggregation is done in-process — avoids
  // 5 separate count() queries.
  const allRooms = await prisma.room.findMany({
    select: { roomStatus: true, floorNo: true },
  });

  let totalRooms = 0;
  let occupiedRooms = 0;
  let vacantRooms = 0;
  let maintenanceRooms = 0;
  let ownerUseRooms = 0;
  const floorMap = new Map<number, FloorOccupancy>();

  for (const room of allRooms) {
    totalRooms++;
    const floorNumber = room.floorNo ?? 0;
    if (!floorMap.has(floorNumber)) {
      floorMap.set(floorNumber, { floorNumber, total: 0, occupied: 0, vacant: 0, maintenance: 0, occupancyRate: 0 });
    }
    const entry = floorMap.get(floorNumber)!;
    entry.total++;
    if (room.roomStatus === 'OCCUPIED') { occupiedRooms++; entry.occupied++; }
    else if (room.roomStatus === 'VACANT') { vacantRooms++; entry.vacant++; }
    else if (room.roomStatus === 'MAINTENANCE') { maintenanceRooms++; entry.maintenance++; }
    else if (room.roomStatus === 'OWNER_USE') { ownerUseRooms++; }
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