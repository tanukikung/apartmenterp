import { NextRequest, NextResponse } from 'next/server';
import { messagingSequenceService } from '@/modules/messaging-sequence/messaging-sequence.service';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/messaging-sequences - List all sequences
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['OWNER', 'ADMIN']);
  const sequences = await messagingSequenceService.listSequences();
  return NextResponse.json({ success: true, data: sequences } as ApiResponse<typeof sequences>);
});

// ============================================================================
// POST /api/messaging-sequences - Create a sequence
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['OWNER', 'ADMIN']);
  const body = await req.json();
  const sequence = await messagingSequenceService.createSequence(body);
  return NextResponse.json({ success: true, data: sequence }, { status: 201 });
});