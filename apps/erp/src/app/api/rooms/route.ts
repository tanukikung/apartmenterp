import { NextRequest, NextResponse } from 'next/server';
import { getRoomService } from '@/modules/rooms/room.service';
import {
  createRoomSchema,
  listRoomsQuerySchema,
} from '@/modules/rooms/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/rooms - List all rooms
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url);
  
  // Parse query parameters
  const query = {
    floorId: url.searchParams.get('floorId') || undefined,
    status: url.searchParams.get('status') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '20',
    search: url.searchParams.get('search') || undefined,
    sortBy: url.searchParams.get('sortBy') || 'roomNumber',
    sortOrder: url.searchParams.get('sortOrder') || 'asc',
    usageType: url.searchParams.get('usageType') || undefined,
    billingStatus: url.searchParams.get('billingStatus') || undefined,
    isActive: url.searchParams.get('isActive') || undefined,
  };

  // Validate query
  const validatedQuery = listRoomsQuerySchema.parse(query);

  const roomService = getRoomService();
  const result = await roomService.listRooms(validatedQuery);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// ============================================================================
// POST /api/rooms - Create a new room
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const body = await req.json();

  // Validate input
  const input = createRoomSchema.parse(body);

  const roomService = getRoomService();
  const room = await roomService.createRoom(input);

  logger.info({
    type: 'room_created_api',
    roomId: room.id,
    roomNumber: room.roomNumber,
  });

  return NextResponse.json({
    success: true,
    data: room,
    message: 'Room created successfully',
  } as ApiResponse<typeof room>, { status: 201 });
});
