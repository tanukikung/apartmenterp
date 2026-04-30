import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const UPLOAD_WINDOW_MS = 60 * 1000;
const UPLOAD_MAX_ATTEMPTS = 5;

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`template-image-upload:${ip}`, UPLOAD_MAX_ATTEMPTS, UPLOAD_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const { url } = await req.json();

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ success: false, error: { message: 'URL is required' } }, { status: 400 });
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ success: false, error: { message: 'Invalid URL' } }, { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return NextResponse.json({ success: false, error: { message: 'Only HTTP/HTTPS URLs are allowed' } }, { status: 400 });
  }

  // Fetch the image server-side
  let imageBuffer: ArrayBuffer;
  let contentType: string;
  try {
    const imageRes = await fetch(parsedUrl.toString(), {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'ApartmentERP/1.0' },
    });

    if (!imageRes.ok) {
      return NextResponse.json({ success: false, error: { message: `Failed to fetch image: ${imageRes.status}` } }, { status: 422 });
    }

    contentType = imageRes.headers.get('content-type') ?? 'image/jpeg';
    // SVG is blocked due to script injection risk
    const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(contentType)) {
      return NextResponse.json({ success: false, error: { message: `URL does not point to an image (${contentType})` } }, { status: 422 });
    }

    imageBuffer = await imageRes.arrayBuffer();
    const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
    if (imageBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ success: false, error: { message: `Image too large (max 50 MB)` } }, { status: 422 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to fetch image';
    return NextResponse.json({ success: false, error: { message: msg } }, { status: 422 });
  }

  // Convert to File-like object for the existing upload service
  const blob = new Blob([imageBuffer], { type: contentType });
  const fileName = parsedUrl.pathname.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '_') ?? `image-${Date.now()}.jpg`;
  const mockFile = new File([blob], fileName, { type: contentType });

  const service = getDocumentTemplateService();
  const result = await service.uploadTemplateImage(params.id, mockFile);

  return NextResponse.json({ success: true, data: result } as ApiResponse<typeof result>, { status: 201 });
});