import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { createExpenseService } from '@/modules/expenses';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const profitLossQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

// ============================================================================
// GET /api/reports/profit-loss - Get profit/loss report
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);

  const url = new URL(req.url);
  const yearStr = url.searchParams.get('year');
  const monthStr = url.searchParams.get('month');

  if (!yearStr || !monthStr) {
    return NextResponse.json({
      success: false,
      error: { message: 'year and month query parameters are required' },
    }, { status: 400 });
  }

  const validated = profitLossQuerySchema.parse({ year: yearStr, month: monthStr });
  const expenseService = createExpenseService();
  const report = await expenseService.getProfitLossReport(validated.year, validated.month);

  return NextResponse.json({
    success: true,
    data: report,
  } as ApiResponse<typeof report>);
});