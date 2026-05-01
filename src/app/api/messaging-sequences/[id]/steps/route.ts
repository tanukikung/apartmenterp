import { NextRequest, NextResponse } from 'next/server';
import { messagingSequenceService } from '@/modules/messaging-sequence/messaging-sequence.service';
import { asyncHandler } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

interface StepsParams {
  params: { id: string };
}

type StepOp = 'add' | 'update' | 'delete' | 'reorder';

// ============================================================================
// POST /api/messaging-sequences/[id]/steps - Add or Reorder steps
// Body: { op: 'add' | 'reorder', stepId?, targetOrder?, step?: StepInput }
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest, { params }: StepsParams): Promise<NextResponse> => {
  requireRole(req, ['OWNER', 'ADMIN']);
  const body = await req.json();
  const { op } = body as { op: StepOp; stepId?: string; targetOrder?: number; step?: Record<string, unknown> };

  if (op === 'add') {
    const result = await messagingSequenceService.addStep(params.id, body.step);
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  }

  if (op === 'reorder') {
    const result = await messagingSequenceService.reorderSteps(params.id, body.stepId, body.targetOrder);
    return NextResponse.json({ success: true, data: result });
  }

  return NextResponse.json(
    { success: false, error: { message: 'Invalid op. Use add or reorder.', code: 'INVALID_OP', name: 'BadRequestError', statusCode: 400 } },
    { status: 400 }
  );
});

// ============================================================================
// PUT /api/messaging-sequences/[id]/steps - Update a step
// Body: { stepId, step: StepInput }
// ============================================================================

export const PUT = asyncHandler(async (req: NextRequest, { params }: StepsParams): Promise<NextResponse> => {
  requireRole(req, ['OWNER', 'ADMIN']);
  const body = await req.json();
  const { stepId, step } = body as { stepId: string; step: Record<string, unknown> };
  const result = await messagingSequenceService.updateStep(stepId, step);
  return NextResponse.json({ success: true, data: result });
});

// ============================================================================
// DELETE /api/messaging-sequences/[id]/steps - Delete a step
// Body: { stepId }
// ============================================================================

export const DELETE = asyncHandler(async (req: NextRequest, { params }: StepsParams): Promise<NextResponse> => {
  requireRole(req, ['OWNER', 'ADMIN']);
  const body = await req.json();
  const { stepId } = body as { stepId: string };
  await messagingSequenceService.deleteStep(stepId);
  return NextResponse.json({ success: true, data: null });
});