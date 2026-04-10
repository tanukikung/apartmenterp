import { z } from 'zod';

// ============================================================================
// Expense Types
// ============================================================================

export const expenseCategorySchema = z.enum([
  'CLEANING',
  'REPAIR',
  'UTILITY',
  'STAFF_SALARY',
  'MANAGEMENT',
  'OTHER',
]);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'CLEANING',
  'REPAIR',
  'UTILITY',
  'STAFF_SALARY',
  'MANAGEMENT',
  'OTHER',
];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  CLEANING: 'ทำความสะอาด',
  REPAIR: 'ซ่อมแซม',
  UTILITY: 'ค่าสาธารณูปโภค',
  STAFF_SALARY: 'เงินเดือนพนักงาน',
  MANAGEMENT: 'ค่าบริหารจัดการ',
  OTHER: 'อื่นๆ',
};

// ============================================================================
// Create Expense DTO
// ============================================================================

export const createExpenseSchema = z.object({
  category: expenseCategorySchema,
  amount: z.number().positive('Amount must be positive'),
  date: z.string().or(z.date()).transform(val => new Date(val)),
  description: z.string().min(1, 'Description is required').max(2000),
  paidTo: z.string().max(500).optional(),
  receiptNo: z.string().max(100).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

// ============================================================================
// Update Expense DTO
// ============================================================================

export const updateExpenseSchema = z.object({
  category: expenseCategorySchema.optional(),
  amount: z.number().positive().optional(),
  date: z.string().or(z.date()).optional(),
  description: z.string().min(1).max(2000).optional(),
  paidTo: z.string().max(500).optional().nullable(),
  receiptNo: z.string().max(100).optional().nullable(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

// ============================================================================
// List Expenses Query
// ============================================================================

export const listExpensesQuerySchema = z.object({
  category: expenseCategorySchema.optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['date', 'amount', 'createdAt', 'category']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

// ============================================================================
// Response DTOs
// ============================================================================

export interface ExpenseResponse {
  id: string;
  category: ExpenseCategory;
  categoryLabel: string;
  amount: number;
  date: Date;
  description: string;
  paidTo: string | null;
  receiptNo: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseListResponse {
  data: ExpenseResponse[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Monthly Summary DTO
// ============================================================================

export interface MonthlyExpenseSummary {
  year: number;
  month: number;
  categories: {
    category: ExpenseCategory;
    categoryLabel: string;
    total: number;
    count: number;
  }[];
  totalExpenses: number;
}

// ============================================================================
// Profit/Loss Report DTO
// ============================================================================

export interface ProfitLossReport {
  year: number;
  month: number;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  incomeByCategory: {
    category: string;
    total: number;
  }[];
  expenseByCategory: {
    category: ExpenseCategory;
    categoryLabel: string;
    total: number;
  }[];
}