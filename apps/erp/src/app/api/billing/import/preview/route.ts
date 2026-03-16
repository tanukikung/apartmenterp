import { NextRequest, NextResponse } from 'next/server';
import { parseBillingWorkbookDetailed } from '@/modules/billing/import-parser';
import { asyncHandler, type ApiResponse } from '@/lib/utils/errors';

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: { name: 'BadRequest', message: 'Missing file', code: 'BAD_REQUEST', statusCode: 400 } }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const { rows: parsed, summaryRows } = parseBillingWorkbookDetailed(new Uint8Array(arrayBuffer));

  const groups: Record<string, { roomNumber: string; year: number; month: number; total: number; count: number }> = {};
  for (const r of parsed) {
    const key = `${r.roomNumber}:${r.year}:${r.month}`;
    if (!groups[key]) groups[key] = { roomNumber: r.roomNumber, year: r.year, month: r.month, total: 0, count: 0 };
    groups[key].total += r.quantity * r.unitPrice;
    groups[key].count += 1;
  }

  const preview = Object.values(groups);
  const warnings = summaryRows
    .map((row) => {
      const key = `${row.roomNumber}:${row.year}:${row.month}`;
      const grouped = groups[key];
      if (!grouped || row.declaredTotalAmount === undefined) return null;

      const difference = Number((grouped.total - row.declaredTotalAmount).toFixed(2));
      if (Math.abs(difference) < 0.01) return null;

      return {
        roomNumber: row.roomNumber,
        year: row.year,
        month: row.month,
        expectedTotal: row.declaredTotalAmount,
        calculatedTotal: grouped.total,
        difference,
      };
    })
    .filter((warning): warning is NonNullable<typeof warning> => warning !== null);

  return NextResponse.json({
    success: true,
    data: { rows: parsed, preview, warnings },
  } as ApiResponse<{ rows: typeof parsed; preview: typeof preview; warnings: typeof warnings }>);
}); 
