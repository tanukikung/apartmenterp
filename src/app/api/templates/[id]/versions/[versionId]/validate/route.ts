import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getDocumentTemplateService } from '@/modules/documents/template.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

export const POST = asyncHandler(async (
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } },
): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`template-version-validate:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  // Auth required; actorId not recorded for pure validation checks.
  const _session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const service = getDocumentTemplateService();

  // Verify the version belongs to this template
  const version = await service.getTemplateById(params.id);
  const found = version.versions?.some((v) => v.id === params.versionId);
  if (!found) {
    return NextResponse.json(
      { success: false, error: { message: 'Version not found', code: 'NOT_FOUND' } },
      { status: 404 },
    );
  }

  const result = await service.validateVersion(params.versionId);
  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
