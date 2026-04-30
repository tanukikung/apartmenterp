import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse, BadRequestError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { logAudit } from '@/modules/audit/audit.service';
import { Prisma } from '@prisma/client';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

class ConflictError extends BadRequestError {
  constructor(message: string) {
    super(message);
  }
}

// Admin write operations: 20/min
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

type BillingRule = {
  code: string;
  descriptionTh: string;
  waterEnabled: boolean;
  waterUnitPrice: unknown;
  waterMinCharge: unknown;
  waterServiceFeeMode: string;
  waterServiceFeeAmount: unknown;
  electricEnabled: boolean;
  electricUnitPrice: unknown;
  electricMinCharge: unknown;
  electricServiceFeeMode: string;
  electricServiceFeeAmount: unknown;
  penaltyPerDay: unknown;
  maxPenalty: unknown;
  gracePeriodDays: number;
};

// ---------------------------------------------------------------------------
// GET /api/billing-rules
// ---------------------------------------------------------------------------

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);
  const rules = await prisma.billingRule.findMany({
    orderBy: { code: 'asc' },
    select: {
      code: true,
      descriptionTh: true,
      waterEnabled: true,
      waterUnitPrice: true,
      waterMinCharge: true,
      waterServiceFeeMode: true,
      waterServiceFeeAmount: true,
      electricEnabled: true,
      electricUnitPrice: true,
      electricMinCharge: true,
      electricServiceFeeMode: true,
      electricServiceFeeAmount: true,
      penaltyPerDay: true,
      maxPenalty: true,
      gracePeriodDays: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: rules,
  } as ApiResponse<typeof rules>);
});

// ---------------------------------------------------------------------------
// POST /api/billing-rules
// ---------------------------------------------------------------------------

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`billing-rules:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  const session = requireRole(req, ['ADMIN', 'OWNER']);
  const body = await req.json() as Partial<BillingRule> & { code: string; descriptionTh: string };

  if (!body.code?.trim()) {
    throw new BadRequestError('กรุณากรอกรหัสกฎ');
  }
  if (!body.descriptionTh?.trim()) {
    throw new BadRequestError('กรุณากรอกชื่อกฎ (ภาษาไทย)');
  }

  try {
    const rule = await prisma.billingRule.create({
      data: {
        code: body.code.trim(),
        descriptionTh: body.descriptionTh.trim(),
        waterEnabled: body.waterEnabled ?? false,
        waterUnitPrice: (body.waterUnitPrice as number) ?? 0,
        waterMinCharge: (body.waterMinCharge as number) ?? 0,
        waterServiceFeeMode: (body.waterServiceFeeMode as 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE') ?? 'NONE',
        waterServiceFeeAmount: (body.waterServiceFeeAmount as number) ?? 0,
        electricEnabled: body.electricEnabled ?? false,
        electricUnitPrice: (body.electricUnitPrice as number) ?? 0,
        electricMinCharge: (body.electricMinCharge as number) ?? 0,
        electricServiceFeeMode: (body.electricServiceFeeMode as 'NONE' | 'FLAT_ROOM' | 'PER_UNIT' | 'MANUAL_FEE') ?? 'NONE',
        electricServiceFeeAmount: (body.electricServiceFeeAmount as number) ?? 0,
        penaltyPerDay: (body.penaltyPerDay as number) ?? 0,
        maxPenalty: (body.maxPenalty as number) ?? 0,
        gracePeriodDays: body.gracePeriodDays ?? 0,
      },
    });

    await logAudit({
      actorId: session.sub,
      actorRole: session.role,
      action: 'BILLING_RULE_CREATED',
      entityType: 'BillingRule',
      entityId: rule.code,
      metadata: { code: rule.code, descriptionTh: rule.descriptionTh },
    });

    return NextResponse.json({ success: true, data: rule });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(`รหัสกฎ "${body.code}" มีอยู่แล้วในระบบ`);
    }
    throw err;
  }
});
