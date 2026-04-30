import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const GET = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const service = getDocumentTemplateService();
  const version = await service.getVersionContent(params.id, params.versionId);
  return NextResponse.json({ success: true, data: version } as ApiResponse<typeof version>);
});

export const PATCH = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`template-version-content-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const body = await req.json();
  const service = getDocumentTemplateService();
  const updated = await service.updateVersionContent(params.id, params.versionId, body.body ?? '', body.subject ?? null);
  return NextResponse.json({ success: true, data: updated } as ApiResponse<typeof updated>);
});
