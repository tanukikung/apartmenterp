import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import {
  updateRoomSchema,
} from '@/modules/rooms/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';
import { requireRole } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { logAudit } from '@/modules/audit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

// ============================================================================
// GET /api/rooms/[id] - Get room by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
    const { id } = params;

    const { roomService } = getServiceContainer();
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
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`rooms-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    const session = requireRole(req, ['ADMIN', 'OWNER']);
    const { id } = params;
    const body = await req.json();

    // Validate input
    const input = updateRoomSchema.parse(body);

    const { roomService } = getServiceContainer();
    const room = await roomService.updateRoom(id, input);

    await logAudit({
      actorId: session.sub,
      actorRole: 'ADMIN',
      action: 'ROOM_UPDATED',
      entityType: 'Room',
      entityId: room.roomNo,
      metadata: { roomNo: room.roomNo },
    });

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
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`rooms-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    const session = requireRole(req, ['ADMIN', 'OWNER']);
    const { id } = params;

    // Look up room before deleting (deleteRoom returns void)
    const roomToDelete = await prisma.room.findUnique({ where: { roomNo: id } });
    if (!roomToDelete) {
      return NextResponse.json(
        { success: false, error: { message: 'Room not found', code: 'NOT_FOUND', name: 'NotFoundError', statusCode: 404 } },
        { status: 404 }
      );
    }

    const { roomService } = getServiceContainer();
    await roomService.deleteRoom(id);

    await logAudit({
      actorId: session.sub,
      actorRole: 'ADMIN',
      action: 'ROOM_DELETED',
      entityType: 'Room',
      entityId: id,
      metadata: { roomNo: roomToDelete.roomNo },
    });

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
