/**
 * Broadcast CRUD API — admin creates, lists, sends broadcasts to tenants.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { getLineClient } from '@/lib/line';
import { isLineConfigured } from '@/lib/line/is-configured';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_ATTEMPTS = 20;

/** LINE pushMessage */
interface LinePushResult {
  messageId?: string;
}

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
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

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

// POST /api/broadcast — create and send a broadcast
export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`broadcast:${ip}`, CHAT_MAX_ATTEMPTS, CHAT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many broadcast requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']) as { sub: string; role: string; displayName?: string };
  const actorId = session.sub;
  const actorName = session.displayName;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
  const idempotencyKey =
    req.headers.get('Idempotency-Key') ||
    (body.idempotencyKey as string | null | undefined);

  // Check DB for existing broadcast with this idempotency key
  if (idempotencyKey) {
    const existing = await prisma.broadcast.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return NextResponse.json(
        { success: true, data: existing } as ApiResponse<unknown>,
        { status: 200 }
      );
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
        lineMessageId = (result as LinePushResult).messageId;
        sent++;
      } catch (err: unknown) {
        const error = err as { status?: number; message?: string; headers?: { get?: (name: string) => string | null } };
        // Handle LINE rate limit (429) with retry-after header
        if (error.status === 429) {
          const retryAfterMs = (parseInt(error.headers?.get?.('retry-after') ?? '0', 10) || 60) * 1000;
          logger.warn({ type: 'broadcast_rate_limited', userId, retryAfterMs, error: String(err) });
          // Wait for retry-after period then retry once
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
          try {
            const result = await lineClient.pushMessage(userId, {
              type: 'text',
              text: input.message,
            });
            lineMessageId = (result as LinePushResult).messageId;
            sent++;
          } catch (retryErr) {
            logger.warn({ type: 'broadcast_send_error_retry', userId, error: String(retryErr) });
            failed++;
          }
        } else {
          logger.warn({ type: 'broadcast_send_error', userId, error: String(err) });
          failed++;
        }
      }
      // Rate limiter: max ~20 messages/second (50ms delay between each)
      if (userId !== lineUserIds[lineUserIds.length - 1]) {
        await new Promise((resolve) => setTimeout(resolve, 50));
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