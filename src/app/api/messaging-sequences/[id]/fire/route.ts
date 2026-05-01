import { NextRequest, NextResponse } from 'next/server';
import { messagingSequenceService } from '@/modules/messaging-sequence/messaging-sequence.service';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/messaging-sequences/[id]/fire - Manually fire a sequence for a tenant
// Query: ?tenantId=<uuid>
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  const session = requireRole(req, ['OWNER', 'ADMIN']);
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: { message: 'tenantId query param required', code: 'MISSING_PARAM', name: 'BadRequestError', statusCode: 400 } },
      { status: 400 }
    );
  }
  const result = await messagingSequenceService.fireSequence(params.id, tenantId, session.sub);
  return NextResponse.json({ success: true, data: result } as ApiResponse<typeof result>);
});