import { NextRequest, NextResponse } from 'next/server';
import type { ImportBatchStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth/guards';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { listBillingImportBatches } from '@/modules/billing/import-batch.service';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ImportBatchStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);

  const { searchParams } = req.nextUrl;
  const statusParam = searchParams.get('status');
  const status =
    statusParam && VALID_STATUSES.includes(statusParam as ImportBatchStatus)
      ? (statusParam as ImportBatchStatus)
      : undefined;

  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '25');

  const result = await listBillingImportBatches({ status, page, pageSize });

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});
