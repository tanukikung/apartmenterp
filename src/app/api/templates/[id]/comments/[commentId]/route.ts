import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

const updateCommentSchema = z.object({
  resolved: z.boolean().optional(),
  content: z.string().min(1).optional(),
});

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`template-comment-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const body = updateCommentSchema.parse(await req.json());

  // Build update data using a column-name allowlist — no Prisma.raw needed
  const updateData: Prisma.DocumentTemplateCommentUpdateInput = {};
  if (body.resolved !== undefined) updateData.resolved = body.resolved;
  if (body.content !== undefined) updateData.content = body.content;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ success: false, error: { name: 'ValidationError', message: 'No fields to update', code: 'VALIDATION_ERROR', statusCode: 422 } }, { status: 422 });
  }

  const comment = await prisma.documentTemplateComment.update({
    where: { id: params.commentId },
    data: updateData,
  });

  const result = {
    ...comment,
    createdAt: comment.createdAt.toISOString(),
  };
  return NextResponse.json({ success: true, data: result } as ApiResponse<typeof result>);
});

export const DELETE = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; commentId: string } },
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`template-comment-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  await prisma.$executeRaw`DELETE FROM document_template_comments WHERE id = ${params.commentId}`;
  return NextResponse.json({ success: true, data: null } as ApiResponse<null>);
});