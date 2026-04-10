/**
 * Broadcast CRUD API — admin creates, lists, sends broadcasts to tenants.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { getLineClient } from '@/lib/line';
import { isLineConfigured } from '@/lib/line/is-configured';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/utils/logger';

const createSchema = z.object({
  message: z.string().min(1).max(5000),
  target: z.enum(['ALL', 'FLOORS', 'ROOMS']).default('ALL'),
  targetFloors: z.array(z.number().int().min(1).max(99)).optional(),
  targetRooms: z.array(z.string().min(1)).optional(),
});

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  target: z.enum(['ALL', 'FLOORS', 'ROOMS']).optional(),
  status: z.enum(['PENDING', 'SENDING', 'COMPLETED', 'PARTIAL', 'FAILED']).optional(),
});

// GET /api/broadcast — list broadcasts
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const { searchParams } = new URL(req.url);
  const raw = Object.fromEntries(searchParams.entries());
  const query = listSchema.parse(raw);

  const where: Record<string, unknown> = {};
  if (query.target) where.target = query.target;
  if (query.status) where.status = query.status;

  const [total, items] = await Promise.all([
    prisma.broadcast.count({ where }),
    prisma.broadcast.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    },
  } as ApiResponse<unknown>);
});

// In-memory idempotency cache (used before schema has idempotencyKey field)
// TTL: 5 minutes
const idempotencyCache = new Map<string, { broadcastId: string; createdAt: number }>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

// POST /api/broadcast — create and send a broadcast
export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']) as { sub: string; role: string; displayName?: string };
  const actorId = session.sub;
  const actorName = session.displayName;

  const body = await req.json().catch(() => ({}));
  const idempotencyKey =
    req.headers.get('Idempotency-Key') ||
    body.idempotencyKey;

  // Check in-memory cache first (fallback when DB field not yet migrated)
  if (idempotencyKey) {
    const cached = idempotencyCache.get(idempotencyKey);
    if (cached && Date.now() - cached.createdAt < IDEMPOTENCY_TTL_MS) {
      const existing = await prisma.broadcast.findUnique({ where: { id: cached.broadcastId } });
      if (existing) {
        const response = NextResponse.json(
          { success: true, data: existing } as ApiResponse<unknown>,
          { status: 200 }
        );
        response.headers.set('X-Idempotent-Replay', 'true');
        return response;
      }
    }
    // Also check DB directly for idempotency key (covers all statuses including FAILED)
    const existingByKey = await prisma.broadcast.findUnique({ where: { idempotencyKey } });
    if (existingByKey) {
      const response = NextResponse.json(
        { success: true, data: existingByKey } as ApiResponse<unknown>,
        { status: 200 }
      );
      response.headers.set('X-Idempotent-Replay', 'true');
      return response;
    }
  }

  const input = createSchema.parse(body);

  // Resolve target rooms (floor filter or explicit room list)
  let roomFilter: Record<string, unknown> = {};
  if (input.target === 'FLOORS' && input.targetFloors?.length) {
    roomFilter = { floorNo: { in: input.targetFloors } };
  } else if (input.target === 'ROOMS' && input.targetRooms?.length) {
    roomFilter = { roomNo: { in: input.targetRooms } };
  }

  // Get occupied rooms with LINE-linked tenants
  const rooms = await prisma.room.findMany({
    where: {
      roomStatus: 'OCCUPIED',
      ...roomFilter,
    },
    include: {
      tenants: {
        where: { moveOutDate: null },
        include: { tenant: true },
      },
    },
  });

  const lineUserIds = rooms
    .flatMap((r) => r.tenants)
    .map((rt) => rt.tenant.lineUserId)
    .filter(Boolean) as string[];

  // Create broadcast record
  const broadcast = await prisma.broadcast.create({
    data: {
      id: uuidv4(),
      message: input.message,
      target: input.target,
      targetFloors: input.targetFloors ?? [],
      targetRooms: input.targetRooms ?? [],
      sentBy: actorId,
      sentByName: actorName,
      totalCount: lineUserIds.length,
      sentCount: 0,
      failedCount: 0,
      status: 'PENDING',
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  });

  // Track in in-memory cache
  if (idempotencyKey) {
    // Prune all expired entries before adding new one to prevent memory leak
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    for (const [k, v] of idempotencyCache.entries()) {
      if (v.createdAt < cutoff) idempotencyCache.delete(k);
    }
    idempotencyCache.set(idempotencyKey, { broadcastId: broadcast.id, createdAt: Date.now() });
  }

  // Send LINE messages
  if (lineUserIds.length > 0 && isLineConfigured()) {
    const lineClient = getLineClient();
    let sent = 0;
    let failed = 0;
    let lineMessageId: string | undefined;

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: 'SENDING' },
    });

    for (const userId of lineUserIds) {
      try {
        const result = await lineClient.pushMessage(userId, {
          type: 'text',
          text: input.message,
        });
        lineMessageId = (result as unknown as { messageId?: string }).messageId;
        sent++;
      } catch (err) {
        logger.warn({ type: 'broadcast_send_error', userId, error: String(err) });
        failed++;
      }
    }

    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: {
        status: failed === 0 ? 'COMPLETED' : failed === lineUserIds.length ? 'FAILED' : 'PARTIAL',
        sentCount: sent,
        failedCount: failed,
        lineMessageId,
      },
    });
  } else {
    await prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: lineUserIds.length === 0 ? 'COMPLETED' : 'FAILED' },
    });
  }

  await logAudit({
    actorId,
    actorRole: session.role,
    action: 'BROADCAST_CREATED',
    entityType: 'BROADCAST',
    entityId: broadcast.id,
    metadata: {
      target: input.target,
      totalCount: lineUserIds.length,
    },
  });

  const updated = await prisma.broadcast.findUnique({ where: { id: broadcast.id } });

  return NextResponse.json(
    { success: true, data: updated } as ApiResponse<unknown>,
    { status: 201 }
  );
});