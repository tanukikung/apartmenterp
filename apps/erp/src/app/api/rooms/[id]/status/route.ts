import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import { changeRoomStatusSchema } from '@/modules/rooms/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// ============================================================================
// PATCH /api/rooms/[id]/status - Change room status
// ============================================================================

export const PATCH = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    const { id } = params;
    const body = await req.json();

    // Validate input
    const input = changeRoomStatusSchema.parse(body);

    const { roomService } = getServiceContainer();
    const room = await roomService.changeRoomStatus(id, input);

    logger.info({
      type: 'room_status_changed_api',
      roomNo: room.roomNo,
      newStatus: room.roomStatus,
    });

    return NextResponse.json({
      success: true,
      data: room,
      message: 'Room status updated successfully',
    } as ApiResponse<typeof room>);
  }
);
