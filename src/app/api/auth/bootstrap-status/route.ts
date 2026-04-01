import { NextResponse } from 'next/server';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
export const GET = asyncHandler(async (): Promise<NextResponse> => {
  const userCount = await prisma.adminUser.count();

  return NextResponse.json({
    success: true,
    data: {
      hasUsers: userCount > 0,
      firstUserSetup: userCount === 0,
      publicSignUpEnabled: true,
      requiresOwnerApproval: userCount > 0,
    },
  } as ApiResponse<{
    hasUsers: boolean;
    firstUserSetup: boolean;
    publicSignUpEnabled: boolean;
    requiresOwnerApproval: boolean;
  }>);
});
