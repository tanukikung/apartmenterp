import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getBillingImportBatchDetail } from '@/modules/billing/import-batch.service';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    requireRole(req, ['ADMIN']);

    const result = await getBillingImportBatchDetail(params.id);

    return NextResponse.json({
      success: true,
      data: result,
    } as ApiResponse<typeof result>);
  },
);
