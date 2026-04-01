import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/db/client';
import { getStorage } from '@/infrastructure/storage';

export function guessDocumentContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^\w.\-]/g, '_');
}

export async function storeDocumentFile(input: {
  keyPrefix: string;
  filename: string;
  content: Buffer;
  mimeType?: string;
  uploadedBy?: string | null;
}) {
  const storage = getStorage();
  const safeName = sanitizeFilename(input.filename);
  const storageKey = `${input.keyPrefix}/${uuidv4()}/${safeName}`;
  const mimeType = input.mimeType ?? guessDocumentContentType(safeName);
  const stored = await storage.uploadFile({
    key: storageKey,
    content: input.content,
    contentType: mimeType,
  });

  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  const url = baseUrl ? `${baseUrl}/api/files/${stored.key}` : `/api/files/${stored.key}`;

  return prisma.uploadedFile.create({
    data: {
      originalName: input.filename,
      mimeType,
      size: input.content.byteLength,
      storageKey: stored.key,
      url,
      uploadedBy: input.uploadedBy ?? null,
    },
  });
}
