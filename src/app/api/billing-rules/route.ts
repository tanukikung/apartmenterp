import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse, BadRequestError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { Prisma } from '@prisma/client';

class ConflictError extends BadRequestError {
  constructor(message: string) {
    super(message);
  }
}

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
  requireRole(req, ['ADMIN']);
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

    return NextResponse.json({ success: true, data: rule } as ApiResponse<typeof rule>);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError(`รหัสกฎ "${body.code}" มีอยู่แล้วในระบบ`);
    }
    throw err;
  }
});
