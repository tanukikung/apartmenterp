import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { getStorage } from '@/infrastructure/storage';

function guessContentTypeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

export const GET = asyncHandler(
  async (req: NextRequest, ctx?: unknown): Promise<NextResponse> => {
    const params = (ctx as { params?: { key?: string[] } } | undefined)?.params;
    const keyParts = params?.key ?? [];
    const storageKey = keyParts.join('/');
    const storage = getStorage();
    try {
      const buffer = await storage.downloadFile(storageKey);
      const contentType = guessContentTypeFromKey(storageKey);
      const url = new URL(req.url);
      const inline = url.searchParams.get('inline') === '1';
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
    } catch {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }
  }
);
