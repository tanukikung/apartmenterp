import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; imageId: string } },
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`template-image-action-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const service = getDocumentTemplateService();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }
  if (body.action === 'restore') {
    // Restore from trash back to active
    const restored = await service.restoreTemplateImage(params.id, params.imageId);
    return NextResponse.json({ success: true, data: restored } as ApiResponse<typeof restored>);
  }

  if (body.action === 'archive') {
    // Mark image as pending archive (soft delete from document)
    const archived = await service.archiveTemplateImage(params.id, params.imageId);
    return NextResponse.json({ success: true, data: archived } as ApiResponse<typeof archived>);
  }

  return NextResponse.json({ success: false, error: { message: 'Unknown action' } }, { status: 400 });
});