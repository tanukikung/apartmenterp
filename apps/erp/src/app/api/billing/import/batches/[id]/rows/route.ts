import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { getBillingImportBatchDetail } from '@/modules/billing/import-batch.service';

export const dynamic = 'force-dynamic';

export const GET = asyncHandler(
  async (
    req: NextRequest,
    { params }: { params: { id: string } },
  ): Promise<NextResponse> => {
    requireAuthSession(req);

    const result = await getBillingImportBatchDetail(params.id);

    return NextResponse.json({
      success: true,
      data: {
        rows: result.rows,
        batch: {
          id: result.id,
          status: result.status,
          totalRows: result.totalRows,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
          warningRows: result.warningRows,
        },
      },
    } as ApiResponse<{
      rows: typeof result.rows;
      batch: {
        id: string;
        status: typeof result.status;
        totalRows: number;
        validRows: number;
        invalidRows: number;
        warningRows: number;
      };
    }>);
  },
);
