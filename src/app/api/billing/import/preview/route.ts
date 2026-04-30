import { NextRequest, NextResponse } from 'next/server';
import { createBillingImportPreviewBatch } from '@/modules/billing/import-batch.service';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getStorage } from '@/infrastructure/storage';
import { prisma } from '@/lib';
import { v4 as uuidv4 } from 'uuid';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

function guessWorkbookMimeType(name: string, fallback: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) {
    return 'application/vnd.ms-excel';
  }
  return fallback || 'application/octet-stream';
}

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`billing-import-preview:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many billing requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }

  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: { name: 'BadRequest', message: 'Missing file', code: 'BAD_REQUEST', statusCode: 400 } }, { status: 400 });
  }

  // Validation: XLSX/XLS only, max 20 MB (utility workbooks are normally <5 MB)
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Only .xlsx or .xls files are supported', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 },
    );
  }
  const MAX_IMPORT_SIZE = 20 * 1024 * 1024;
  if (file.size > MAX_IMPORT_SIZE) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Import file too large (max 20 MB)', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const storageKey = `billing-imports/${uuidv4()}/${safeName}`;
  const storage = getStorage();
  const contentType = guessWorkbookMimeType(file.name, file.type);
  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');

  let uploadedFileId: string | null = null;

  try {
    const stored = await storage.uploadFile({
      key: storageKey,
      content: buffer,
      contentType,
    });

    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        originalName: file.name,
        mimeType: contentType,
        size: file.size,
        storageKey: stored.key,
        url: baseUrl ? `${baseUrl}/api/files/${stored.key}` : `/api/files/${stored.key}`,
      },
    });
    uploadedFileId = uploadedFile.id;

    const result = await createBillingImportPreviewBatch({
      filename: file.name,
      fileBuffer: new Uint8Array(arrayBuffer),
      uploadedFileId,
      storageKey,
    });

    return NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<typeof result>);
  } catch (error) {
    if (uploadedFileId) {
      await prisma.uploadedFile
        .delete({ where: { id: uploadedFileId } })
        .catch((e) => {
          console.warn('[billing/import-preview] cleanup failed:', e);
        });
    }
    await storage.deleteFile(storageKey).catch((e) => {
      console.warn('[billing/import-preview] cleanup failed:', e);
    });
    throw error;
  }
}); 
