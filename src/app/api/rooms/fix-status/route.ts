import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';

// ============================================================================
// POST /api/rooms/fix-status - Fix orphaned OCCUPIED rooms (no tenants)
// ============================================================================

interface FixResult {
  totalChecked: number;
  totalFixed: number;
  fixedRooms: string[];
  alreadyOk: number;
}

export const POST = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    requireRole(req, ['ADMIN']);

    // Find all rooms with status OCCUPIED
    const occupiedRooms = await prisma.room.findMany({
      where: { roomStatus: 'OCCUPIED' },
      select: { roomNo: true },
    });

    const result: FixResult = {
      totalChecked: occupiedRooms.length,
      totalFixed: 0,
      fixedRooms: [],
      alreadyOk: 0,
    };

    for (const room of occupiedRooms) {
      // Check if this room has any active RoomTenant records
      const roomTenantCount = await prisma.roomTenant.count({
        where: {
          roomNo: room.roomNo,
          moveOutDate: null, // only active tenants
        },
      });

      if (roomTenantCount === 0) {
        // No tenants - set to VACANT
        await prisma.room.update({
          where: { roomNo: room.roomNo },
          data: { roomStatus: 'VACANT' },
        });
        result.fixedRooms.push(room.roomNo);
        result.totalFixed++;
      } else {
        result.alreadyOk++;
      }
    }

    logger.info({
      type: 'rooms_fix_status',
      ...result,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Checked ${result.totalChecked} occupied rooms. Fixed ${result.totalFixed} orphaned rooms.`,
    } as ApiResponse<FixResult>);
  }
);

// ============================================================================
// GET /api/rooms/fix-status - Check orphaned OCCUPIED rooms (dry run)
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest): Promise<NextResponse> => {
    requireRole(req, ['ADMIN']);

    // Find all rooms with status OCCUPIED
    const occupiedRooms = await prisma.room.findMany({
      where: { roomStatus: 'OCCUPIED' },
      select: { roomNo: true },
    });

    const orphanedRooms: string[] = [];

    for (const room of occupiedRooms) {
      const roomTenantCount = await prisma.roomTenant.count({
        where: {
          roomNo: room.roomNo,
          moveOutDate: null,
        },
      });

      if (roomTenantCount === 0) {
        orphanedRooms.push(room.roomNo);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalOccupied: occupiedRooms.length,
        orphanedCount: orphanedRooms.length,
        orphanedRooms,
      },
    } as ApiResponse<{
      totalOccupied: number;
      orphanedCount: number;
      orphanedRooms: string[];
    }>);
  }
);
