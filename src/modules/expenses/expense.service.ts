import { prisma, logger } from '@/lib';
import {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesQuery,
  ExpenseResponse,
  ExpenseListResponse,
  MonthlyExpenseSummary,
  ProfitLossReport,
  ExpenseCategory,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORIES,
} from './types';
import { NotFoundError, BadRequestError } from '@/lib/utils/errors';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// Expense Service
// ============================================================================

export class ExpenseService {
  /**
   * Create a new expense record
   */
  async createExpense(input: CreateExpenseInput, createdBy?: string): Promise<ExpenseResponse> {
    logger.info({ type: 'expense_create', category: input.category, amount: input.amount });

    const expense = await prisma.expense.create({
      data: {
        category: input.category,
        amount: input.amount,
        date: input.date instanceof Date ? input.date : new Date(input.date),
        description: input.description,
        paidTo: input.paidTo || null,
        receiptNo: input.receiptNo || null,
        createdBy: createdBy || null,
      },
    });

    return this.formatExpenseResponse(expense);
  }

  /**
   * Get expense by ID
   */
  async getExpenseById(id: string): Promise<ExpenseResponse> {
    const expense = await prisma.expense.findUnique({
      where: { id },
    });

    if (!expense) {
      throw new NotFoundError('Expense', id);
    }

    return this.formatExpenseResponse(expense);
  }

  /**
   * Update an expense
   */
  async updateExpense(id: string, input: UpdateExpenseInput): Promise<ExpenseResponse> {
    logger.info({ type: 'expense_update', id });

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Expense', id);
    }

    const updateData: Record<string, unknown> = {};
    if (input.category !== undefined) updateData.category = input.category;
    if (input.amount !== undefined) updateData.amount = input.amount;
    if (input.date !== undefined) {
      updateData.date = input.date instanceof Date ? input.date : new Date(input.date);
    }
    if (input.description !== undefined) updateData.description = input.description;
    if (input.paidTo !== undefined) updateData.paidTo = input.paidTo;
    if (input.receiptNo !== undefined) updateData.receiptNo = input.receiptNo;

    const expense = await prisma.expense.update({
      where: { id },
      data: updateData,
    });

    return this.formatExpenseResponse(expense);
  }

  /**
   * Delete an expense
   */
  async deleteExpense(id: string): Promise<void> {
    logger.info({ type: 'expense_delete', id });

    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Expense', id);
    }

    await prisma.expense.delete({ where: { id } });
  }

  /**
   * List expenses with filtering and pagination
   */
  async listExpenses(query: ListExpensesQuery): Promise<ExpenseListResponse> {
    const { category, year, month, startDate, endDate, page, pageSize, sortBy, sortOrder } = query;

    // Build where clause
    const where: Record<string, unknown> = {};

    if (category) {
      where.category = category;
    }

    if (year && month) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    } else if (year) {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    }

    if (startDate) {
      where.date = { ...(where.date as object || {}), gte: new Date(startDate) };
    }
    if (endDate) {
      where.date = { ...(where.date as object || {}), lte: new Date(endDate) };
    }

    // Get total count
    const total = await prisma.expense.count({ where });

    // Get expenses with pagination
    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      data: expenses.map((e) => this.formatExpenseResponse(e)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * Get monthly expense summary grouped by category
   */
  async getMonthlyExpenseSummary(year: number, month: number): Promise<MonthlyExpenseSummary> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const expenses = await prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      orderBy: { category: 'asc' },
    });

    // Group by category
    const categoryMap = new Map< string, { category: string; categoryLabel: string; total: number; count: number }>();

    for (const expense of expenses) {
      const cat = expense.category;
      const existing = categoryMap.get(cat);
      if (existing) {
        existing.total += Number(expense.amount);
        existing.count += 1;
      } else {
        categoryMap.set(cat, {
          category: cat as ExpenseCategory,
          categoryLabel: EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] || cat,
          total: Number(expense.amount),
          count: 1,
        });
      }
    }

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      year,
      month,
      categories: Array.from(categoryMap.values()) as { category: ExpenseCategory; categoryLabel: string; total: number; count: number }[],
      totalExpenses,
    };
  }

  /**
   * Get profit/loss report for a billing period
   * Income = sum of paid invoices, Expenses = sum of expense records
   */
  async getProfitLossReport(year: number, month: number): Promise<ProfitLossReport> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    // Get paid invoices for the period
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        status: 'PAID',
        paidAt: { gte: start, lte: end },
      },
    });

    const totalIncome = paidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

    // Get expenses for the period
    const expenses = await prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    // Group expenses by category
    const expenseByCategory = new Map<string, { category: string; categoryLabel: string; total: number }>();
    for (const expense of expenses) {
      const cat = expense.category;
      const existing = expenseByCategory.get(cat);
      if (existing) {
        existing.total += Number(expense.amount);
      } else {
        expenseByCategory.set(cat, {
          category: cat as ExpenseCategory,
          categoryLabel: EXPENSE_CATEGORY_LABELS[cat as ExpenseCategory] || cat,
          total: Number(expense.amount),
        });
      }
    }

    return {
      year,
      month,
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      incomeByCategory: [{ category: 'RENT', total: totalIncome }],
      expenseByCategory: Array.from(expenseByCategory.values()) as { category: ExpenseCategory; categoryLabel: string; total: number }[],
    };
  }

  /**
   * Format expense for response
   */
  private formatExpenseResponse(expense: {
    id: string;
    category: string;
    amount: Decimal;
    date: Date;
    description: string;
    paidTo: string | null;
    receiptNo: string | null;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ExpenseResponse {
    return {
      id: expense.id,
      category: expense.category as ExpenseResponse['category'],
      categoryLabel: EXPENSE_CATEGORY_LABELS[expense.category as keyof typeof EXPENSE_CATEGORY_LABELS] || expense.category,
      amount: Number(expense.amount),
      date: expense.date,
      description: expense.description,
      paidTo: expense.paidTo,
      receiptNo: expense.receiptNo,
      createdBy: expense.createdBy,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createExpenseService(): ExpenseService {
  return new ExpenseService();
}