import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { prisma } from '@/lib/db/client';
import { getSessionFromRequest } from '@/lib/auth/session';

type BootstrapData = {
  hasUsers: boolean;
  firstUserSetup: boolean;
  publicSignUpEnabled: boolean;
  requiresOwnerApproval: boolean;
};

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  // Allow unauthenticated access for setup flow, but if a valid session exists
  // (e.g. reloading the page after initial setup), prefer the authenticated response.
  const session = getSessionFromRequest(req);
  if (session) {
    return NextResponse.json({
      success: true,
      data: {
        hasUsers: true,
        firstUserSetup: false,
        publicSignUpEnabled: false,
        requiresOwnerApproval: true,
      } as BootstrapData,
    });
  }

  const userCount = await prisma.adminUser.count();

  return NextResponse.json({
    success: true,
    data: {
      hasUsers: userCount > 0,
      firstUserSetup: userCount === 0,
      publicSignUpEnabled: true,
      requiresOwnerApproval: userCount > 0,
    } as BootstrapData,
  } as ApiResponse<BootstrapData>);
});
