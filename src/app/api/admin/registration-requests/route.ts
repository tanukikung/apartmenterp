import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'OWNER']);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? 'PENDING';

  const requests = await prisma.staffRegistrationRequest.findMany({
    where: { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      status: true,
      createdAt: true,
      reviewedAt: true,
      rejectReason: true,
      reviewedById: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: requests,
  } as ApiResponse<typeof requests>);
});
