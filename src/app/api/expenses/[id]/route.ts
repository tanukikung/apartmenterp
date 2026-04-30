import { NextRequest, NextResponse } from 'next/server';
import { asyncHandler, ApiResponse } from '@/lib/utils/errors';
import { requireRole } from '@/lib/auth/guards';
import { createExpenseService } from '@/modules/expenses';
import { updateExpenseSchema } from '@/modules/expenses/types';
import { getLoginRateLimiter } from '@/lib/utils/rate-limit';

const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_ATTEMPTS = 20;
const DELETE_WINDOW_MS = 60 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/expenses/[id] - Get expense by ID
// ============================================================================

export const GET = asyncHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  requireRole(req, ['ADMIN', 'STAFF', 'OWNER']);
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
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`expenses-patch:${ip}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
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
  const limiter = getLoginRateLimiter();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
  const { allowed, remaining, resetAt } = await limiter.check(`expenses-delete:${ip}`, DELETE_MAX_ATTEMPTS, DELETE_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { message: `Too many requests. Try again after ${resetAt.toLocaleTimeString()}.`, code: 'RATE_LIMIT_EXCEEDED', name: 'RateLimitError', statusCode: 429 } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)), 'X-RateLimit-Remaining': String(remaining) } }
    );
  }
  requireRole(req, ['ADMIN', 'OWNER']);
  const { id } = await params;
  const expenseService = createExpenseService();
  await expenseService.deleteExpense(id);

  return NextResponse.json({
    success: true,
    data: null,
    message: 'Expense deleted successfully',
  } as ApiResponse<null>);
});