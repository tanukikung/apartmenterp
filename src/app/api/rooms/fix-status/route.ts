import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { prisma } from '@/lib';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

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
    const limiter = getLoginRateLimiter();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
    const { allowed, remaining, resetAt } = await limiter.check(`rooms-fix-status:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
      );
    }
    requireRole(req, ['ADMIN', 'OWNER']);

    // Single query: find OCCUPIED rooms with no active tenants
    const orphanedRooms = await prisma.$queryRaw<{ roomNo: string }[]>`
      SELECT r."roomNo"
      FROM rooms r
      WHERE r."roomStatus" = 'OCCUPIED'
        AND NOT EXISTS (
          SELECT 1 FROM "roomTenants" rt
          WHERE rt."roomNo" = r."roomNo" AND rt."moveOutDate" IS NULL
        )
    `;

    const result: FixResult = {
      totalChecked: orphanedRooms.length,
      totalFixed: 0,
      fixedRooms: [],
      alreadyOk: 0,
    };

    if (orphanedRooms.length > 0) {
      // Batch update in a transaction
      await prisma.$transaction(
        orphanedRooms.map((room) =>
          prisma.room.update({
            where: { roomNo: room.roomNo },
            data: { roomStatus: 'VACANT' },
          })
        )
      );
      result.fixedRooms = orphanedRooms.map((r) => r.roomNo);
      result.totalFixed = orphanedRooms.length;
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
    requireRole(req, ['ADMIN', 'OWNER']);

    // Single query: find OCCUPIED rooms with no active tenants (dry run)
    const orphanedRooms = await prisma.$queryRaw<{ roomNo: string }[]>`
      SELECT r."roomNo"
      FROM rooms r
      WHERE r."roomStatus" = 'OCCUPIED'
        AND NOT EXISTS (
          SELECT 1 FROM "roomTenants" rt
          WHERE rt."roomNo" = r."roomNo" AND rt."moveOutDate" IS NULL
        )
    `;

    return NextResponse.json({
      success: true,
      data: {
        totalOccupied: orphanedRooms.length,
        orphanedCount: orphanedRooms.length,
        orphanedRooms: orphanedRooms.map((r) => r.roomNo),
      },
    } as ApiResponse<{
      totalOccupied: number;
      orphanedCount: number;
      orphanedRooms: string[];
    }>);
  }
);
