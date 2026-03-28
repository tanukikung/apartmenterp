import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getStorage } from '@/infrastructure/storage';
import { logger } from '@/lib/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib';

function guessContentType(name: string, fallback: string = 'application/octet-stream'): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return fallback;
}

export const POST = asyncHandler(async (request: NextRequest): Promise<NextResponse> => {
  requireRole(request, ['ADMIN']);
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json(
      { success: false, error: 'No file provided' },
      { status: 400 }
    );
  }

  const maxMb = Number.parseInt(process.env.FILE_MAX_UPLOAD_MB || '', 10);
  const maxSize = Number.isFinite(maxMb) && maxMb > 0 ? maxMb * 1024 * 1024 : 25 * 1024 * 1024; // default 25MB
  if (file.size > maxSize) {
    return NextResponse.json(
      { success: false, error: `File too large (max ${Math.floor(maxSize / (1024 * 1024))}MB)` },
      { status: 400 }
    );
  }

  const storage = getStorage();
  const id = uuidv4();
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const key = `chat-uploads/${id}/${safeName}`;
  const contentType = file.type || guessContentType(file.name);

  const allowedFromEnv = (process.env.FILE_ALLOWED_MIME || '').trim();
  const allowed = new Set(
    allowedFromEnv
      ? allowedFromEnv.split(',').map((x) => x.trim()).filter(Boolean)
      : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  );
  if (!allowed.has(contentType)) {
    return NextResponse.json(
      { success: false, error: 'Unsupported file type' },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await storage.uploadFile({
      key,
      content: buffer,
      contentType,
    });

    const baseUrl = process.env.APP_BASE_URL || '';
    const path = `/api/files/${result.key}`;
    const url = baseUrl ? `${baseUrl}${path}` : path;

    const record = await prisma.uploadedFile.create({
      data: {
        originalName: file.name,
        mimeType: contentType,
        size: file.size,
        storageKey: result.key,
        url,
        // uploadedBy can be injected from auth context later
      },
    });

    logger.info({
      type: 'file_uploaded',
      key: result.key,
      name: file.name,
      size: file.size,
      contentType,
    });

    const data = {
      id: record.id,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      storageKey: record.storageKey,
      url: record.url,
      createdAt: record.createdAt,
      uploadedBy: record.uploadedBy ?? null,
    };

    return NextResponse.json({ success: true, data } as ApiResponse<typeof data>, { status: 201 });
  } catch (error) {
    logger.error({
      type: 'file_upload_failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
});
