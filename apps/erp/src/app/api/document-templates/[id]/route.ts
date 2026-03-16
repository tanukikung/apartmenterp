import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAuthSession, requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit';
import { z } from 'zod';

/** Max characters for the template body — must match the create route. */
const BODY_MAX_CHARS = 100_000;

const updateSchema = z.object({
  name:    z.string().min(1).max(255).optional(),
  type:    z.enum(['INVOICE', 'CONTRACT', 'RECEIPT', 'NOTICE', 'OTHER']).optional(),
  subject: z.string().max(500).nullish(),
  body:    z.string().min(1).max(BODY_MAX_CHARS).optional(),
});

// ── GET /api/document-templates/[id] ─────────────────────────────────────────

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> => {
  requireAuthSession(req);

  const template = await prisma.documentTemplate.findUnique({ where: { id: params.id } });
  if (!template) throw new NotFoundError('Document template not found');

  return NextResponse.json({ success: true, data: template } as ApiResponse<typeof template>);
});

// ── PATCH /api/document-templates/[id] ───────────────────────────────────────

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const existing = await prisma.documentTemplate.findUnique({ where: { id: params.id } });
  if (!existing) throw new NotFoundError('Document template not found');

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { message: 'Validation failed', details: parsed.error.errors } },
      { status: 400 }
    );
  }

  const updated = await prisma.documentTemplate.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.name    !== undefined && { name: parsed.data.name }),
      ...(parsed.data.type    !== undefined && { type: parsed.data.type }),
      ...(parsed.data.subject !== undefined && { subject: parsed.data.subject ?? null }),
      ...(parsed.data.body    !== undefined && { body: parsed.data.body }),
    },
  });

  // Audit: template updated
  const changedFields = Object.keys(parsed.data).filter(
    (k) => parsed.data[k as keyof typeof parsed.data] !== undefined
  );
  await logAudit({
    actorId:    'system',
    actorRole:  'ADMIN',
    action:     'DOCUMENT_TEMPLATE_UPDATED',
    entityType: 'DOCUMENT_TEMPLATE',
    entityId:   params.id,
    metadata: {
      name:          updated.name,
      type:          updated.type,
      changedFields,
      bodyLength:    updated.body.length,
    },
  });

  return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
});

// ── DELETE /api/document-templates/[id] ──────────────────────────────────────

export const DELETE = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);

  const existing = await prisma.documentTemplate.findUnique({ where: { id: params.id } });
  if (!existing) throw new NotFoundError('Document template not found');

  await prisma.documentTemplate.delete({ where: { id: params.id } });

  // Audit: template deleted — capture snapshot before deletion
  await logAudit({
    actorId:    'system',
    actorRole:  'ADMIN',
    action:     'DOCUMENT_TEMPLATE_DELETED',
    entityType: 'DOCUMENT_TEMPLATE',
    entityId:   params.id,
    metadata: {
      name: existing.name,
      type: existing.type,
    },
  });

  return NextResponse.json({ success: true, data: { id: params.id } });
});
