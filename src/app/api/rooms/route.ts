import { NextRequest, NextResponse } from 'next/server';
import { getServiceContainer } from '@/lib/service-container';
import {
  createRoomSchema,
  listRoomsQuerySchema,
} from '@/modules/rooms/types';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { requireOperator, requireRole, requireBuildingAccess } from '@/lib/auth/guards';
import { prisma } from '@/lib';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/rooms - List all rooms
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireOperator(req);
  const url = new URL(req.url);
  
  // Parse query parameters
  const query = {
    floorNo: url.searchParams.get('floorNo') || undefined,
    roomStatus: url.searchParams.get('roomStatus') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '20',
    search: url.searchParams.get('search') || undefined,
    q: url.searchParams.get('q') || undefined,
    sortBy: url.searchParams.get('sortBy') || 'roomNo',
    sortOrder: url.searchParams.get('sortOrder') || 'asc',
  };

  // Validate query
  const validatedQuery = listRoomsQuerySchema.parse(query);

  const { roomService } = getServiceContainer();
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
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`rooms:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  requireBuildingAccess(session, null);
  const body = await req.json();

  // Validate input
  const input = createRoomSchema.parse(body);

  // Pre-check: defaultAccountId must exist
  const account = await prisma.bankAccount.findUnique({ where: { id: input.defaultAccountId } });
  if (!account) {
    return NextResponse.json({ success: false, error: 'ไม่พบบัญชีธนาคารที่เลือก' }, { status: 400 });
  }

  // Pre-check: defaultRuleCode must exist
  const rule = await prisma.billingRule.findUnique({ where: { code: input.defaultRuleCode } });
  if (!rule) {
    return NextResponse.json({ success: false, error: 'ไม่พบรหัสกฎการเรียกเก็บที่เลือก' }, { status: 400 });
  }

  const { roomService } = getServiceContainer();
  const room = await roomService.createRoom(input);

  logger.info({
    type: 'room_created_api',
    roomNo: room.roomNo,
  });

  return NextResponse.json({
    success: true,
    data: room,
    message: 'Room created successfully',
  } as ApiResponse<typeof room>, { status: 201 });
});
