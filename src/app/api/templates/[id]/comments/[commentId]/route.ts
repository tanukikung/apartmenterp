import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const updateCommentSchema = z.object({
  resolved: z.boolean().optional(),
  content: z.string().min(1).optional(),
});

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

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const body = updateCommentSchema.parse(await req.json());
  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.resolved !== undefined) {
    updates.push('resolved = $' + (values.length + 1));
    values.push(body.resolved);
  }
  if (body.content !== undefined) {
    updates.push('"content" = $' + (values.length + 1));
    values.push(body.content);
  }
  if (updates.length === 0) {
    return NextResponse.json({ success: false, error: { name: 'ValidationError', message: 'No fields to update', code: 'VALIDATION_ERROR', statusCode: 422 } }, { status: 422 });
  }
  values.push(params.commentId);
  const row = await prisma.$queryRaw<CommentRow[]>`
    UPDATE document_template_comments
    SET ${Prisma.raw(updates.join(', '))}
    WHERE id = ${params.commentId}
    RETURNING id, "templateId", "versionId", "anchorText", "content", "authorId", "authorName", resolved, "createdAt", "updatedAt"
  `;
  const comment = { ...row[0], createdAt: row[0].createdAt.toISOString() };
  return NextResponse.json({ success: true, data: comment } as ApiResponse<typeof comment>);
});

export const DELETE = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  await prisma.$executeRaw`DELETE FROM document_template_comments WHERE id = ${params.commentId}`;
  return NextResponse.json({ success: true, data: null } as ApiResponse<null>);
});