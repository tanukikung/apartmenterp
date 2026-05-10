import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceContainer } from '@/lib/service-container';
import {
  updateRoomSchema,
} from '@/modules/rooms/types';
import { asyncHandler } from '@/lib/utils/errors';
import { formatSuccess } from '@/lib/api-response';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';
import { requireRole } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';
import { logAudit } from '@/modules/audit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

const deleteRoomSchema = z.object({
  reason: z.string().min(5, 'ต้องระบุเหตุผลอย่างน้อย 5 ตัวอักษร'),
});

// ============================================================================
// GET /api/rooms/[id] - Get room by ID
// ============================================================================

export const GET = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    await requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
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

    return NextResponse.json(
      formatSuccess({
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
      })
    );
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
    const session = await requireRole(req, ['ADMIN', 'OWNER']);
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

    return NextResponse.json(
      formatSuccess(room, 'Room updated successfully')
    );
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
    const session = await requireRole(req, ['ADMIN', 'OWNER']);
    const { id } = params;

    // Parse and require reason for audit trail
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const { reason } = deleteRoomSchema.parse(body);

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
      metadata: { roomNo: roomToDelete.roomNo, reason },
    });

    logger.info({
      type: 'room_deleted_api',
      roomId: id,
    });

    return NextResponse.json(
      formatSuccess(null, 'Room deleted successfully')
    );
  }
);
