import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const GET = asyncHandler(async (
  req: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  { params: _params }: { params: { id: string } },
): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  // OnlyOffice has been removed from this installation.
  // Templates are now edited directly in the built-in Tiptap editor.
  return NextResponse.json({
    success: false,
    configured: false,
    error: {
      message: 'OnlyOffice has been removed. Templates are edited using the built-in Tiptap editor on the template edit page.',
      code: 'ONLYOFFICE_REMOVED',
    },
  } as ApiResponse<never> & { configured: boolean; error: { message: string; code: string } });
});
