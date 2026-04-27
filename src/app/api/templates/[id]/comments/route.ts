import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { z } from 'zod';

const createCommentSchema = z.object({
  anchorText: z.string().min(1),
  content: z.string().min(1),
  versionId: z.string().optional(),
});

// Use raw query to bypass Prisma client regeneration requirement
type CommentRow = {
  id: string;
  templateId: string;
  versionId: string | null;
  anchorText: string;
  content: string;
  authorId: string;
  authorName: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const rows = await prisma.$queryRaw<CommentRow[]>`
    SELECT id, "templateId", "versionId", "anchorText", "content", "authorId", "authorName", "resolved", "createdAt", "updatedAt"
    FROM document_template_comments
    WHERE "templateId" = ${params.id}
    ORDER BY "createdAt" ASC
  `;
  const comments = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  return NextResponse.json({ success: true, data: comments } as ApiResponse<typeof comments>);
});

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);
  const body = createCommentSchema.parse(await req.json());
  const id = crypto.randomUUID();
  const now = new Date();
  const row = await prisma.$queryRaw<CommentRow[]>`
    INSERT INTO document_template_comments (id, "templateId", "versionId", "anchorText", "content", "authorId", "authorName", resolved, "createdAt", "updatedAt")
    VALUES (${id}, ${params.id}, ${body.versionId ?? null}, ${body.anchorText}, ${body.content}, ${session.sub}, ${session.displayName || session.username}, false, ${now}, ${now})
    RETURNING id, "templateId", "versionId", "anchorText", "content", "authorId", "authorName", resolved, "createdAt", "updatedAt"
  `;
  const comment = { ...row[0], createdAt: row[0].createdAt.toISOString() };
  return NextResponse.json({ success: true, data: comment } as ApiResponse<typeof comment>, { status: 201 });
});
