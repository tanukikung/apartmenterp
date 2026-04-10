import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { createExpenseService } from '@/modules/expenses';
import { updateExpenseSchema } from '@/modules/expenses/types';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/expenses/[id] - Get expense by ID
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params;
  const expenseService = createExpenseService();
  const expense = await expenseService.getExpenseById(id);

  return NextResponse.json({
    success: true,
    data: expense,
  } as ApiResponse<typeof expense>);
});

// ============================================================================
// PATCH /api/expenses/[id] - Update expense
// ============================================================================

export const PATCH = asyncHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);
  const { id } = await params;
  const body = await req.json();

  const input = updateExpenseSchema.parse(body);
  const expenseService = createExpenseService();
  const expense = await expenseService.updateExpense(id, input);

  return NextResponse.json({
    success: true,
    data: expense,
    message: 'Expense updated successfully',
  } as ApiResponse<typeof expense>);
});

// ============================================================================
// DELETE /api/expenses/[id] - Delete expense
// ============================================================================

export const DELETE = asyncHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  requireRole(req, ['ADMIN']);
  const { id } = await params;
  const expenseService = createExpenseService();
  await expenseService.deleteExpense(id);

  return NextResponse.json({
    success: true,
    data: null,
    message: 'Expense deleted successfully',
  } as ApiResponse<null>);
});