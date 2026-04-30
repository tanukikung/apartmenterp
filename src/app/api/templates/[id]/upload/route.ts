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
  const { allowed, remaining, resetAt } = await limiter.check(`template-upload:${ip}`, UPLOAD_MAX_ATTEMPTS, UPLOAD_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Missing template file', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 },
    );
  }
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.html') && !lowerName.endsWith('.htm')) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Template upload currently supports HTML files only', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 },
    );
  }
  const MAX_TEMPLATE_SIZE = 5 * 1024 * 1024; // 5 MB — HTML templates should be small
  if (file.size > MAX_TEMPLATE_SIZE) {
    return NextResponse.json(
      { success: false, error: { name: 'BadRequest', message: 'Template file too large (max 5 MB)', code: 'BAD_REQUEST', statusCode: 400 } },
      { status: 400 },
    );
  }

  const service = getDocumentTemplateService();
  const result = await service.uploadTemplateVersion(params.id, file, session.sub);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>, { status: 201 });
});
