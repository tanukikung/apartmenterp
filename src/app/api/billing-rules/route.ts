import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req);
  const rules = await prisma.billingRule.findMany({
    orderBy: { code: 'asc' },
    select: { code: true, descriptionTh: true },
  });

  return NextResponse.json({
    success: true,
    data: rules,
  } as ApiResponse<typeof rules>);
});
