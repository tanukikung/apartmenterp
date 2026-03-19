import { NextRequest, NextResponse } from 'next/server';
import { getRoomService } from '@/modules/rooms/room.service';
import {
  updateRoomSchema,
} from '@/modules/rooms/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';

// ============================================================================
// GET /api/rooms/[id] - Get room by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;

    const roomService = getRoomService();
    const room = await roomService.getRoomById(id);
    const roomTenants = await prisma.roomTenant.findMany({
      where: {
        roomNo: id,
        moveOutDate: null,
      },
      include: {
        tenant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            lineUserId: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...room,
        roomTenants: roomTenants.map((entry) => ({
          role: entry.role,
          tenant: entry.tenant
            ? {
                id: entry.tenant.id,
                fullName: `${entry.tenant.firstName} ${entry.tenant.lastName}`.trim(),
                phone: entry.tenant.phone,
                lineUserId: entry.tenant.lineUserId,
              }
            : null,
        })),
      },
    } as ApiResponse<typeof room>);
  }
);

// ============================================================================
// PATCH /api/rooms/[id] - Update a room
// ============================================================================

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json();

    // Validate input
    const input = updateRoomSchema.parse(body);

    const roomService = getRoomService();
    const room = await roomService.updateRoom(id, input);

    logger.info({
      type: 'room_updated_api',
      roomNo: room.roomNo,
    });

    return NextResponse.json({
      success: true,
      data: room,
      message: 'Room updated successfully',
    } as ApiResponse<typeof room>);
  }
);

// ============================================================================
// DELETE /api/rooms/[id] - Delete a room
// ============================================================================

export const DELETE = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;

    const roomService = getRoomService();
    await roomService.deleteRoom(id);

    logger.info({
      type: 'room_deleted_api',
      roomId: id,
    });

    return NextResponse.json({
      success: true,
      data: null,
      message: 'Room deleted successfully',
    } as ApiResponse<null>);
  }
);
