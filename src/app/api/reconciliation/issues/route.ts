import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { ReconciliationService } from '@/modules/reconciliation';

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireRole(req, ['ADMIN', 'OWNER']);

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get('severity') as 'CRITICAL' | 'WARNING' | 'INFO' | null;

  const service = new ReconciliationService();
  const issues = await service.listUnresolved(severity ?? undefined);

  const critical = issues.filter(i => i.severity === 'CRITICAL').length;
  const warning = issues.filter(i => i.severity === 'WARNING').length;
  const info = issues.filter(i => i.severity === 'INFO').length;

  return NextResponse.json({
    success: true,
    data: issues,
    meta: { total: issues.length, critical, warning, info },
  } as ApiResponse<unknown>);
});

// POST /api/reconciliation/run — manual trigger
export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  await requireRole(req, ['ADMIN', 'OWNER']);

  const service = new ReconciliationService();
  const result = await service.runDailyReconciliation();

  return NextResponse.json({
    success: true,
    data: result,
    message: `Reconciliation complete: ${result.issues.length} issues found`,
  } as ApiResponse<unknown>);
});