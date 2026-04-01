import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib';
import { requireRole } from '@/lib/auth/guards';

type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: OccupancyData; expiry: number } | null = null;

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);
  const now = Date.now();
  if (cache && cache.expiry > now) {
    return NextResponse.json({ success: true, data: cache.value } as ApiResponse<OccupancyData>);
  }

  const totalRooms = await prisma.room.count();

  // Primary: count rooms with current tenants
  const occupiedByTenant = await prisma.room.count({
    where: { roomStatus: 'OCCUPIED', tenants: { some: { moveOutDate: null } } },
  });

  let occupiedRooms = occupiedByTenant;

  // Fallback: if no tenant data, derive occupancy from current billing period
  if (occupiedRooms === 0) {
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;

    // Try current month, then most recent billing period with substantial data
    let period = await prisma.billingPeriod.findUnique({
      where: { year_month: { year, month } },
    });

    // If current month has very few records, use the most recent period with many records
    if (period) {
      const currentCount = await prisma.roomBilling.count({
        where: { billingPeriodId: period.id, rentAmount: { gt: 0 } },
      });
      if (currentCount < totalRooms * 0.1) {
        // Less than 10% of rooms — likely incomplete, find a better period
        period = null;
      }
    }

    if (!period) {
      // Find the most recent period with substantial billing records
      const recentPeriods = await prisma.billingPeriod.findMany({
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 12,
      });
      for (const p of recentPeriods) {
        const cnt = await prisma.roomBilling.count({
          where: { billingPeriodId: p.id, rentAmount: { gt: 0 } },
        });
        if (cnt >= Math.floor(totalRooms * 0.5)) {
          period = p;
          break;
        }
      }
    }

    if (!period) {
      period = await prisma.billingPeriod.findFirst({
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      });
    }

    if (period) {
      occupiedRooms = await prisma.roomBilling.count({
        where: {
          billingPeriodId: period.id,
          rentAmount: { gt: 0 },
        },
      });
    }
  }

  const vacantRooms = totalRooms - occupiedRooms;

  // Maintenance rooms: count rooms flagged for maintenance (currently ACTIVE/INACTIVE only in DB, default to 0)
  const maintenanceRooms = 0;

  const value: OccupancyData = { totalRooms, occupiedRooms, vacantRooms, maintenanceRooms };
  cache = { value, expiry: now + CACHE_TTL_MS };
  return NextResponse.json({ success: true, data: value } as ApiResponse<OccupancyData>);
});
