import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { createExpenseService } from '@/modules/expenses';
import { listExpensesQuerySchema, createExpenseSchema } from '@/modules/expenses/types';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/expenses - List expenses
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF']);
  const url = new URL(req.url);

  const query = {
    category: url.searchParams.get('category') || undefined,
    year: url.searchParams.get('year') || undefined,
    month: url.searchParams.get('month') || undefined,
    startDate: url.searchParams.get('startDate') || undefined,
    endDate: url.searchParams.get('endDate') || undefined,
    page: url.searchParams.get('page') || '1',
    pageSize: url.searchParams.get('pageSize') || '50',
    sortBy: url.searchParams.get('sortBy') || 'date',
    sortOrder: url.searchParams.get('sortOrder') || 'desc',
  };

  const validatedQuery = listExpensesQuerySchema.parse(query);
  const expenseService = createExpenseService();
  const result = await expenseService.listExpenses(validatedQuery);

  return NextResponse.json({
    success: true,
    data: result,
  } as ApiResponse<typeof result>);
});

// ============================================================================
// POST /api/expenses - Create new expense
// ============================================================================

export const POST = asyncHandler(async (req: NextRequest): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);
  const body = await req.json();

  const input = createExpenseSchema.parse(body);
  const expenseService = createExpenseService();
  const expense = await expenseService.createExpense(input);

  return NextResponse.json({
    success: true,
    data: expense,
    message: 'Expense created successfully',
  } as ApiResponse<typeof expense>, { status: 201 });
});