import { NextRequest, NextResponse } from 'next/server';
import {
  createMonthlyDataImportPreviewBatch,
  listMonthlyDataImportBatches,
} from '@/modules/billing/monthly-data-import.service';
import { asyncHandler, type ApiResponse, ValidationError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getStorage } from '@/infrastructure/storage';
import { prisma } from '@/lib/db/client';
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

// GET — list monthly data import batches
export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '25', 10);
  const status = searchParams.get('status') ?? undefined;

  const result = await listMonthlyDataImportBatches({
    page,
    pageSize,
    status: status as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | undefined,
  });

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// POST — create preview batch (upload file + year/month)
export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`billing-monthly-import:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many billing requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }

  const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);

  // Support both JSON (year, month) and FormData (year, month, file)
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    // JSON mode: file should be base64 encoded
    const body = await req.json();
    const { year, month, filename, fileBase64 } = body;

    if (!year || !month || !filename || !fileBase64) {
      throw new ValidationError('year, month, filename, and fileBase64 are required');
    }

    // Size guard for base64 payload (decoded size ≈ 3/4 of base64 length)
    const MAX_IMPORT_SIZE = 20 * 1024 * 1024;
    if (typeof fileBase64 !== 'string' || fileBase64.length * 0.75 > MAX_IMPORT_SIZE) {
      throw new ValidationError('Import file too large (max 20 MB)');
    }
    const lowerFilename = String(filename).toLowerCase();
    if (!lowerFilename.endsWith('.xlsx') && !lowerFilename.endsWith('.xls')) {
      throw new ValidationError('Only .xlsx or .xls files are supported');
    }

    const fileBuffer = Buffer.from(fileBase64, 'base64');

    const result = await createMonthlyDataImportPreviewBatch({
      filename,
      fileBuffer: new Uint8Array(fileBuffer),
      year: parseInt(year, 10),
      month: parseInt(month, 10),
      importedBy: session.username,
    });

    return NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<typeof result>);
  }

  // FormData mode
  const form = await req.formData();
  const file = form.get('file');
  const yearStr = form.get('year');
  const monthStr = form.get('month');

  if (!(file instanceof File)) {
    throw new ValidationError('Missing file');
  }
  if (!yearStr || !monthStr) {
    throw new ValidationError('year and month are required');
  }

  const year = parseInt(String(yearStr), 10);
  const month = parseInt(String(monthStr), 10);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new ValidationError('year and month must be valid numbers');
  }

  // Validation: XLSX/XLS only, max 20 MB
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls')) {
    throw new ValidationError('Only .xlsx or .xls files are supported');
  }
  const MAX_IMPORT_SIZE = 20 * 1024 * 1024;
  if (file.size > MAX_IMPORT_SIZE) {
    throw new ValidationError('Import file too large (max 20 MB)');
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const storageKey = `billing-imports/monthly-data/${uuidv4()}/${safeName}`;
  const storage = getStorage();
  const contentTypeMime = guessWorkbookMimeType(file.name, file.type);
  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');

  let uploadedFileId: string | null = null;

  try {
    const stored = await storage.uploadFile({
      key: storageKey,
      content: buffer,
      contentType: contentTypeMime,
    });

    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        originalName: file.name,
        mimeType: contentTypeMime,
        size: file.size,
        storageKey: stored.key,
        url: baseUrl ? `${baseUrl}/api/files/${stored.key}` : `/api/files/${stored.key}`,
      },
    });
    uploadedFileId = uploadedFile.id;

    const result = await createMonthlyDataImportPreviewBatch({
      filename: file.name,
      fileBuffer: new Uint8Array(arrayBuffer),
      year,
      month,
      storageKey,
      uploadedFileId,
      importedBy: session.username,
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
          console.warn('[billing/monthly-import] cleanup failed:', e);
        });
    }
    await storage.deleteFile(storageKey).catch((e) => {
      console.warn('[billing/monthly-import] cleanup failed:', e);
    });
    throw error;
  }
});
