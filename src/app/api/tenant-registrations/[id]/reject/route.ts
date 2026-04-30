import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse, NotFoundError, BadRequestError } from '@/lib/utils/errors';
import { logAudit } from '@/modules/audit/audit.service';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 10;

const rejectSchema = z.object({
  reason: z.string().max(250).optional(),
});

type Params = { params: { id: string } };

// ── POST /api/tenant-registrations/[id]/reject ────────────────────────────────

export const POST = asyncHandler(async (req: NextRequest, context?: Params): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`tenant-registration-reject:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  const id = context?.params.id;
  if (!id) throw new NotFoundError('TenantRegistration');

  const body = rejectSchema.parse(await req.json());

  const reg = await prisma.tenantRegistration.findUnique({ where: { id } });
  if (!reg) throw new NotFoundError('TenantRegistration', id);

  if (reg.status === 'APPROVED' || reg.status === 'REJECTED') {
    throw new BadRequestError(`Registration is already ${reg.status.toLowerCase()}`);
  }

  const rejected = await prisma.tenantRegistration.update({
    where: { id },
    data: {
      status: 'REJECTED',
      rejectionReason: body.reason?.trim() || null,
      reviewedById: session.sub,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await logAudit({
    req,
    action: 'TENANT_REGISTRATION_REJECTED',
    entityType: 'TenantRegistration',
    entityId: id,
    metadata: { reason: body.reason },
  });

  return NextResponse.json({
    success: true,
    data: rejected,
    message: 'Registration rejected',
  } as ApiResponse<typeof rejected>);
});
