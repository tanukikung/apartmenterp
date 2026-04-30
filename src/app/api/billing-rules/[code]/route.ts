import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse, BadRequestError, NotFoundError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;

type BillingRuleUpdate = {
  descriptionTh?: string;
  waterEnabled?: boolean;
  waterUnitPrice?: unknown;
  waterMinCharge?: unknown;
  waterServiceFeeMode?: string;
  waterServiceFeeAmount?: unknown;
  electricEnabled?: boolean;
  electricUnitPrice?: unknown;
  electricMinCharge?: unknown;
  electricServiceFeeMode?: string;
  electricServiceFeeAmount?: unknown;
  penaltyPerDay?: unknown;
  maxPenalty?: unknown;
  gracePeriodDays?: number;
};

// ---------------------------------------------------------------------------
// PATCH /api/billing-rules/[code]
// ---------------------------------------------------------------------------

export const PATCH = asyncHandler(async (req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`billing-rules-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
  const code = ctx?.params?.code;
  if (!code) throw new NotFoundError('BillingRule');

  const body = await req.json() as Partial<BillingRuleUpdate>;
  if (!body || Object.keys(body).length === 0) {
    throw new BadRequestError('ไม่มีข้อมูลที่ต้องการอัปเดต');
  }

  const updateData: Record<string, unknown> = {};
  if (body.descriptionTh !== undefined) updateData.descriptionTh = body.descriptionTh.trim();
  if (body.waterEnabled !== undefined) updateData.waterEnabled = body.waterEnabled;
  if (body.waterUnitPrice !== undefined) updateData.waterUnitPrice = body.waterUnitPrice;
  if (body.waterMinCharge !== undefined) updateData.waterMinCharge = body.waterMinCharge;
  if (body.waterServiceFeeMode !== undefined) updateData.waterServiceFeeMode = body.waterServiceFeeMode;
  if (body.waterServiceFeeAmount !== undefined) updateData.waterServiceFeeAmount = body.waterServiceFeeAmount;
  if (body.electricEnabled !== undefined) updateData.electricEnabled = body.electricEnabled;
  if (body.electricUnitPrice !== undefined) updateData.electricUnitPrice = body.electricUnitPrice;
  if (body.electricMinCharge !== undefined) updateData.electricMinCharge = body.electricMinCharge;
  if (body.electricServiceFeeMode !== undefined) updateData.electricServiceFeeMode = body.electricServiceFeeMode;
  if (body.electricServiceFeeAmount !== undefined) updateData.electricServiceFeeAmount = body.electricServiceFeeAmount;
  if (body.penaltyPerDay !== undefined) updateData.penaltyPerDay = body.penaltyPerDay;
  if (body.maxPenalty !== undefined) updateData.maxPenalty = body.maxPenalty;
  if (body.gracePeriodDays !== undefined) updateData.gracePeriodDays = body.gracePeriodDays;

  const rule = await prisma.billingRule.update({
    where: { code },
    data: updateData,
  });

  return NextResponse.json({ success: true, data: rule } as ApiResponse<typeof rule>);
});

// ---------------------------------------------------------------------------
// DELETE /api/billing-rules/[code]
// ---------------------------------------------------------------------------

export const DELETE = asyncHandler(async (req: NextRequest, ctx: { params: { code: string } }): Promise<NextResponse> => {
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`billing-rules-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
  const code = ctx?.params?.code;
  if (!code) throw new NotFoundError('BillingRule');

  // Check if any rooms use this rule as default
  const roomCount = await prisma.room.count({
    where: { defaultRuleCode: code },
  });
  if (roomCount > 0) {
    throw new BadRequestError(`ไม่สามารถลบกฎนี้ได้ เนื่องจากมี ${roomCount} ห้องที่ใช้กฎนี้เป็นค่าเริ่มต้น`);
  }

  // Check if any active billing periods use this rule
  const billingCount = await prisma.roomBilling.count({
    where: { ruleCode: code },
  });
  if (billingCount > 0) {
    throw new BadRequestError(`ไม่สามารถลบกฎนี้ได้ เนื่องจากมี ${billingCount} บิลที่ใช้กฎนี้`);
  }

  await prisma.billingRule.delete({ where: { code } });

  return NextResponse.json({ success: true, data: null } as ApiResponse<null>);
});
