import { NextRequest, NextResponse } from 'next/server';
import { executeMonthlyDataImportBatch } from '@/modules/billing/monthly-data-import.service';
import { asyncHandler, type ApiResponse, ValidationError } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { z } from 'zod';

const bodySchema = z.object({
  batchId: z.string().uuid(),
});

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const session = requireRole(req, ['ADMIN', 'STAFF']);

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('batchId is required and must be a valid UUID');
  }

  const { batchId } = parsed.data;
  const importedBy = session.username;

  const result = await executeMonthlyDataImportBatch(batchId, importedBy);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
