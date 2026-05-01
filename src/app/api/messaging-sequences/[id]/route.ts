import { NextRequest, NextResponse } from 'next/server';
import { messagingSequenceService } from '@/modules/messaging-sequence/messaging-sequence.service';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/messaging-sequences/[id] - Get one sequence with steps
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  requireRole(req, ['OWNER', 'ADMIN']);
  const sequence = await messagingSequenceService.getSequenceById(params.id);
  return NextResponse.json({ success: true, data: sequence } as ApiResponse<typeof sequence>);
});

// ============================================================================
// PUT /api/messaging-sequences/[id] - Update sequence
// ============================================================================

export const PUT = asyncHandler(async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  requireRole(req, ['OWNER', 'ADMIN']);
  const body = await req.json();
  const sequence = await messagingSequenceService.updateSequence(params.id, body);
  return NextResponse.json({ success: true, data: sequence } as ApiResponse<typeof sequence>);
});

// ============================================================================
// DELETE /api/messaging-sequences/[id] - Delete sequence
// ============================================================================

export const DELETE = asyncHandler(async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
  requireRole(req, ['OWNER', 'ADMIN']);
  await messagingSequenceService.deleteSequence(params.id);
  return NextResponse.json({ success: true, data: null } as ApiResponse<null>);
});