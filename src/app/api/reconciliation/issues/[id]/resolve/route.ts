import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { ReconciliationService } from '@/modules/reconciliation';

const resolveSchema = z.object({
  resolution: z.enum(['FIXED', 'IGNORED', 'AUTO_FIXED']),
  notes: z.string().optional(),
});

export const POST = asyncHandler(
  async (req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> => {
    await requireRole(req, ['ADMIN', 'OWNER']);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { message: 'Invalid JSON body', statusCode: 400, name: 'ParseError', code: 'INVALID_JSON' } },
        { status: 400 }
      );
    }

    const validation = resolveSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: { message: validation.error.errors[0]?.message ?? 'Invalid input', statusCode: 400, name: 'ValidationError', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const session = await requireRole(req, ['ADMIN', 'OWNER']);
    const service = new ReconciliationService();
    await service.resolveIssue(params.id, session.sub, validation.data.resolution, validation.data.notes);

    return NextResponse.json({
      success: true,
      data: { id: params.id },
      message: 'Issue resolved',
    } as ApiResponse<unknown>);
  }
);