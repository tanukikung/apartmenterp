import { NextRequest, NextResponse } from 'next/server';
import { createBillingImportPreviewBatch } from '@/modules/billing/import-batch.service';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getStorage } from '@/infrastructure/storage';
import { prisma } from '@/lib';
import { v4 as uuidv4 } from 'uuid';

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
  requireRole(req, ['ADMIN', 'STAFF']);

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: { name: 'BadRequest', message: 'Missing file', code: 'BAD_REQUEST', statusCode: 400 } }, { status: 400 });
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
      await prisma.uploadedFile.delete({ where: { id: uploadedFileId } }).catch(() => null);
    }
    await storage.deleteFile(storageKey).catch(() => null);
    throw error;
  }
}); 
