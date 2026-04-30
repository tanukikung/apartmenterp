/**
 * Reminder Config CRUD API — configure auto-reminder schedule.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError, ConflictError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

const createSchema = z.object({
  periodDays: z.number().int().min(-60).max(60),
  messageTh: z.string().min(1).max(5000),
  messageEn: z.string().min(1).max(5000).optional(),
  isActive: z.boolean().default(true),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  appliesTo: z.enum(['ALL', 'OVERDUE', 'DUE_SOON']).default('ALL'),
});

const updateSchema = createSchema.partial();

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  isActive: z.enum(['true', 'false']).optional(),
});

// GET /api/reminders/config
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const { searchParams } = new URL(req.url);
  const raw = Object.fromEntries(searchParams.entries());
  const query = listSchema.parse(raw);

  const where: Record<string, unknown> = {};
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;

  const [total, items] = await Promise.all([
    prisma.reminderConfig.count({ where }),
    prisma.reminderConfig.findMany({
      where,
      orderBy: { periodDays: 'asc' },
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

// POST /api/reminders/config
export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`reminder-config:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  const actorId = session.sub;

  const input = createSchema.parse(await req.json());

  const existing = await prisma.reminderConfig.findUnique({
    where: { periodDays: input.periodDays },
  });
  if (existing) {
    throw new ConflictError(
      `Reminder config for periodDays=${input.periodDays} already exists. Use PUT to update.`
    );
  }

  const config = await prisma.reminderConfig.create({
    data: {
      id: uuidv4(),
      periodDays: input.periodDays,
      messageTh: input.messageTh,
      messageEn: input.messageEn ?? input.messageTh,
      isActive: input.isActive,
      priority: input.priority,
      appliesTo: input.appliesTo,
    },
  });

  await logAudit({
    actorId,
    actorRole: session.role,
    action: 'REMINDER_CONFIG_CREATED',
    entityType: 'REMINDER_CONFIG',
    entityId: config.id,
    metadata: { periodDays: input.periodDays },
  });

  return NextResponse.json({ success: true, data: config } as ApiResponse<unknown>, { status: 201 });
});

// PUT /api/reminders/config
export const PUT = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`reminder-config-put:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  const actorId = session.sub;

  const body = await req.json();
  const { id, ...rest } = z.object({ id: z.string().uuid() }).merge(updateSchema).parse(body);

  const existing = await prisma.reminderConfig.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('ReminderConfig', id);

  const updated = await prisma.reminderConfig.update({
    where: { id },
    data: {
      ...rest,
      messageEn: rest.messageEn ?? existing.messageEn,
    },
  });

  await logAudit({
    actorId,
    actorRole: session.role,
    action: 'REMINDER_CONFIG_UPDATED',
    entityType: 'REMINDER_CONFIG',
    entityId: id,
    metadata: rest,
  });

  return NextResponse.json({ success: true, data: updated } as ApiResponse<unknown>);
});

// DELETE /api/reminders/config
export const DELETE = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`reminder-config-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  const actorId = session.sub;

  const { id } = z.object({ id: z.string().uuid() }).parse(await req.json());
  if (!id) throw new NotFoundError('ReminderConfig', id);

  const existing = await prisma.reminderConfig.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('ReminderConfig', id);

  await prisma.reminderConfig.delete({ where: { id } });

  await logAudit({
    actorId,
    actorRole: session.role,
    action: 'REMINDER_CONFIG_DELETED',
    entityType: 'REMINDER_CONFIG',
    entityId: id,
    metadata: { periodDays: existing.periodDays },
  });

  return NextResponse.json({ success: true, data: { deleted: true } } as ApiResponse<{ deleted: boolean }>);
});