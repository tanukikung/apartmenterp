import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { z } from 'zod';

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
  requireRole(req, ['ADMIN', 'STAFF']);

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
  requireRole(req, ['ADMIN', 'STAFF']);

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
  requireRole(req, ['ADMIN']);

  const existing = await prisma.messageTemplate.findUnique({ where: { id: params.id } });
  if (!existing) throw new NotFoundError('Message template not found');

  await prisma.messageTemplate.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true, data: { id: params.id } });
});
