import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { getSessionFromRequest } from '@/lib/auth/session';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = getSessionFromRequest(req);

  return NextResponse.json({
    success: true,
    data: session
      ? {
          authenticated: true,
          user: {
            id: session.sub,
            username: session.username,
            displayName: session.displayName,
            role: session.role,
            forcePasswordChange: session.forcePasswordChange,
          },
        }
      : {
          authenticated: false,
        },
  } as ApiResponse<
    | {
        authenticated: true;
        user: {
          id: string;
          username: string;
          displayName: string;
          role: string;
          forcePasswordChange: boolean;
        };
      }
    | {
        authenticated: false;
      }
  >);
});
