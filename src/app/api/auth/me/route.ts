import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler } from '@/lib/utils/errors';
import { getSessionFromRequest } from '@/lib/auth/session';
import { formatSuccess } from '@/lib/api-response';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = await getSessionFromRequest(req);

  return NextResponse.json(
    formatSuccess(session
      ? {
          authenticated: true,
          user: {
            id: session.sub,
            username: session.username,
            displayName: session.displayName,
            role: session.role,
            forcePasswordChange: session.forcePasswordChange,
            buildingId: session.buildingId,
          },
        }
      : {
          authenticated: false,
        }
    )
  );
});
