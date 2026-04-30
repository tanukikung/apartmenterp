import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { z } from 'zod';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(['INVOICE_SEND', 'PAYMENT_REMINDER', 'OVERDUE_NOTICE', 'CUSTOM']).optional(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
});

// ── PUT /api/message-templates/[id] ──────────────────────────────────────────
// Page uses PUT (not PATCH) for full replacement.

export const PUT = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`message-templates-put:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const existing = await prisma.messageTemplate.findUnique({ where: { id: params.id } });
  if (!existing) throw new NotFoundError('Message template not found');

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { message: 'Validation failed', details: parsed.error.errors } },
      { status: 400 }
    );
  }

  // Auto-extract variables from body if not supplied
  const newBody = parsed.data.body ?? existing.body;
  const variables = parsed.data.variables
    ?? Array.from(new Set(newBody.match(/\{\{[^}]+\}\}/g) ?? []));

  const updated = await prisma.messageTemplate.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      ...(parsed.data.body !== undefined && { body: parsed.data.body }),
      variables,
    },
  });

  return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
});

// ── PATCH /api/message-templates/[id] ────────────────────────────────────────

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`message-templates-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const existing = await prisma.messageTemplate.findUnique({ where: { id: params.id } });
  if (!existing) throw new NotFoundError('Message template not found');

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { message: 'Validation failed', details: parsed.error.errors } },
      { status: 400 }
    );
  }

  const newBody = parsed.data.body ?? existing.body;
  const variables = parsed.data.variables
    ?? Array.from(new Set(newBody.match(/\{\{[^}]+\}\}/g) ?? []));

  const updated = await prisma.messageTemplate.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      ...(parsed.data.body !== undefined && { body: parsed.data.body }),
      variables,
    },
  });

  return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
});

// ── DELETE /api/message-templates/[id] ───────────────────────────────────────

export const DELETE = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`message-templates-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);

  const existing = await prisma.messageTemplate.findUnique({ where: { id: params.id } });
  if (!existing) throw new NotFoundError('Message template not found');

  await prisma.messageTemplate.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true, data: { id: params.id } });
});
