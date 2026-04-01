import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { AppError, asyncHandler, ForbiddenError, UnauthorizedError } from '@/lib/utils/errors';
import { getStorage } from '@/infrastructure/storage';
import { verifySignedFileAccess } from '@/lib/files/access';

function guessContentTypeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

export const GET = asyncHandler(
  async (req: NextRequest, ctx?: unknown): Promise<NextResponse> => {
    const params = (ctx as { params?: { key?: string[] } } | undefined)?.params;
    const keyParts = params?.key ?? [];
    const storageKey = keyParts.join('/');
    const storage = getStorage();
    try {
      const contentType = guessContentTypeFromKey(storageKey);
      const url = new URL(req.url);
      const inline = url.searchParams.get('inline') === '1';
      const session = getSessionFromRequest(req);
      if (session && !['ADMIN', 'STAFF'].includes(session.role)) {
        throw new ForbiddenError('Insufficient permissions');
      }
      if (!session) {
        const expiresAt = Number(url.searchParams.get('expires') || '');
        const token = url.searchParams.get('token');
        const allowed = verifySignedFileAccess({
          storageKey,
          inline,
          expiresAt,
          token,
        });
        if (!allowed) {
          throw new UnauthorizedError('Authentication required');
        }
      }

      const buffer = await storage.downloadFile(storageKey);
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Cache-Control', 'private, max-age=31536000, immutable');
      headers.set('Content-Disposition', inline ? 'inline' : `attachment; filename="${keyParts[keyParts.length - 1] || 'file'}"`);
      headers.set('Content-Length', String(buffer.byteLength));

      // Stream out the buffer to avoid large body allocation in one go
      const stream = new ReadableStream({
        start(controller) {
          try {
            const chunkSize = 64 * 1024;
            for (let i = 0; i < buffer.length; i += chunkSize) {
              controller.enqueue(buffer.slice(i, i + chunkSize));
            }
            controller.close();
          } catch (e) {
            controller.error(e);
          }
        },
      });
      return new NextResponse(stream as unknown as BodyInit, { status: 200, headers });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }
  }
);
