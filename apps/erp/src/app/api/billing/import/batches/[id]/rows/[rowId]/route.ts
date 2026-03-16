import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { updateBillingImportBatchRow } from '@/modules/billing/import-batch.service';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  roomNumber: z.string().trim().min(1).optional(),
  rentAmount: z.number().min(0).nullable().optional(),
  waterAmount: z.number().min(0).nullable().optional(),
  electricAmount: z.number().min(0).nullable().optional(),
  furnitureAmount: z.number().min(0).nullable().optional(),
  otherAmount: z.number().min(0).nullable().optional(),
  totalAmount: z.number().min(0).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const PATCH = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string; rowId: string } },
  ): Promise<NextResponse> => {
    requireRole(req, ['ADMIN', 'STAFF']);

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Validation failed',
            details: parsed.error.flatten(),
          },
        },
        { status: 400 },
      );
    }

    const result = await updateBillingImportBatchRow(params.id, params.rowId, parsed.data);

    return NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<typeof result>);
  },
);
