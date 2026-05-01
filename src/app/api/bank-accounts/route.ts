import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireOperator } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireOperator(req);
  const accounts = await prisma.bankAccount.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true, bankName: true, bankAccountNo: true },
  });

  return NextResponse.json({
    success: true,
    data: accounts,
  } as ApiResponse<typeof accounts>);
});
