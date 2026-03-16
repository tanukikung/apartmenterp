import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { DocumentTemplateType } from '@prisma/client';
import { z } from 'zod';

const VALID_TYPES: DocumentTemplateType[] = [
  'INVOICE',
  'CONTRACT',
  'RECEIPT',
  'NOTICE',
  'OTHER',
];

/** Max characters for the template body — prevents runaway PDF generation. */
const BODY_MAX_CHARS = 100_000;

const createSchema = z.object({
  name:    z.string().min(1).max(255),
  type:    z.enum(['INVOICE', 'CONTRACT', 'RECEIPT', 'NOTICE', 'OTHER']).default('INVOICE'),
  subject: z.string().max(500).optional(),
  body:    z.string().min(1).max(BODY_MAX_CHARS),
});

// ── GET /api/document-templates ───────────────────────────────────────────────

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireAuthSession(req);

  const { searchParams } = req.nextUrl;
  const pageSize = Math.min(Number(searchParams.get('pageSize') ?? '50'), 200);
  const typeParam = searchParams.get('type') ?? undefined;

  const type: DocumentTemplateType | undefined =
    typeParam && (VALID_TYPES as string[]).includes(typeParam)
      ? (typeParam as DocumentTemplateType)
      : undefined;

  const where = type ? { type } : {};

  const [data, total] = await Promise.all([
    prisma.documentTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: pageSize,
    }),
    prisma.documentTemplate.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: { data, total },
  } as ApiResponse<{ data: typeof data; total: number }>);
});

// ── POST /api/document-templates ──────────────────────────────────────────────

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

  const template = await prisma.documentTemplate.create({
    data: {
      name:    parsed.data.name,
      type:    parsed.data.type,
      subject: parsed.data.subject,
      body:    parsed.data.body,
    },
  });

  // Audit: template created
  await logAudit({
    actorId:    'system',
    actorRole:  'ADMIN',
    action:     'DOCUMENT_TEMPLATE_CREATED',
    entityType: 'DOCUMENT_TEMPLATE',
    entityId:   template.id,
    metadata: {
      name: template.name,
      type: template.type,
      bodyLength: template.body.length,
    },
  });

  return NextResponse.json({ success: true, data: template }, { status: 201 });
});
