import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse, NotFoundError } from '@/lib/utils/errors';
import { getDocumentGenerationService } from '@/modules/documents/generation.service';
import { getStorage } from '@/infrastructure/storage';
import { logAudit } from '@/modules/audit';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const service = getDocumentGenerationService();
  const result = await service.getDocumentById(params.id);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

export const DELETE = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`document-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);

  const document = await prisma.generatedDocument.findUnique({
    where: { id: params.id },
    include: { files: { include: { uploadedFile: true } } },
  });

  if (!document) {
    throw new NotFoundError('GeneratedDocument', params.id);
  }

  // Delete storage files
  const storage = getStorage();
  for (const file of document.files) {
    try {
      await storage.deleteFile(file.uploadedFile.storageKey);
    } catch (err) {
      // File may already be deleted — continue but log the issue
      logger.warn({ type: 'document_file_delete_failed', storageKey: file.uploadedFile.storageKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Delete DB record (cascade deletes GeneratedDocumentFile andUploadedFile records)
  await prisma.generatedDocument.delete({ where: { id: params.id } });

  await logAudit({
    req,
    action: 'GENERATED_DOCUMENT_DELETED',
    entityType: 'GeneratedDocument',
    entityId: params.id,
    metadata: { title: document.title, roomNo: document.roomNo },
  });

  return NextResponse.json({
    success: true,
    data: { id: params.id },
    message: 'Document deleted',
  } as ApiResponse<{ id: string }>);
});
