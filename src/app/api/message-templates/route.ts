import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['INVOICE_SEND', 'PAYMENT_REMINDER', 'OVERDUE_NOTICE', 'CUSTOM']).default('CUSTOM'),
  body: z.string().min(1),
  variables: z.array(z.string()).default([]),
});

// ── GET /api/message-templates ────────────────────────────────────────────────

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);

  const { searchParams } = req.nextUrl;
  const pageSize = Math.min(Number(searchParams.get('pageSize') ?? '100'), 200);

  const data = await prisma.messageTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    take: pageSize,
  });

  return NextResponse.json({
    success: true,
    data: { templates: data, total: data.length },
  } as ApiResponse<{ templates: typeof data; total: number }>);
});

// ── POST /api/message-templates ───────────────────────────────────────────────

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { message: 'Validation failed', details: parsed.error.errors } },
      { status: 400 }
    );
  }

  // Extract variables from body if not provided
  const variables = parsed.data.variables.length > 0
    ? parsed.data.variables
    : Array.from(new Set(parsed.data.body.match(/\{\{[^}]+\}\}/g) ?? []));

  const template = await prisma.messageTemplate.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      body: parsed.data.body,
      variables,
    },
  });

  return NextResponse.json({ success: true, data: template }, { status: 201 });
});
