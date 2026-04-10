import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExpenseService } from '@/modules/expenses';
import { prisma } from '@/lib';
import { NotFoundError } from '@/lib/utils/errors';

vi.mock('@/lib', async () => {
  const actual = await vi.importActual<any>('@/lib');
  return {
    ...actual,
    prisma: {
      expense: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    },
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  };
});

describe('ExpenseService', () => {
  let expenseService: ReturnType<typeof createExpenseService>;

  beforeEach(() => {
    vi.clearAllMocks();
    expenseService = createExpenseService();
  });

  describe('createExpense', () => {
    it('creates an expense record', async () => {
      const mockExpense = {
        id: 'exp-1',
        category: 'CLEANING',
        amount: 500n,
        date: new Date('2026-04-01'),
        description: 'Monthly cleaning service',
        paidTo: 'CleanCo Ltd',
        receiptNo: 'REC-001',
        createdBy: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.expense.create as any).mockResolvedValue(mockExpense);

      const result = await expenseService.createExpense({
        category: 'CLEANING',
        amount: 500,
        date: '2026-04-01',
        description: 'Monthly cleaning service',
        paidTo: 'CleanCo Ltd',
        receiptNo: 'REC-001',
      }, 'admin-1');

      expect(result.id).toBe('exp-1');
      expect(result.category).toBe('CLEANING');
      expect(result.amount).toBe(500);
      expect(result.categoryLabel).toBe('ทำความสะอาด');
    });

    it('throws error for missing required fields', async () => {
      await expect(expenseService.createExpense({
        category: 'CLEANING',
        amount: -100, // negative amount
        date: '2026-04-01',
        description: '',
      } as any)).rejects.toThrow();
    });
  });

  describe('getExpenseById', () => {
    it('returns expense when found', async () => {
      const mockExpense = {
        id: 'exp-1',
        category: 'REPAIR',
        amount: 1500n,
        date: new Date('2026-04-05'),
        description: 'Plumbing repair',
        paidTo: null,
        receiptNo: null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.expense.findUnique as any).mockResolvedValue(mockExpense);

      const result = await expenseService.getExpenseById('exp-1');
      expect(result.id).toBe('exp-1');
      expect(result.category).toBe('REPAIR');
    });

    it('throws NotFoundError when expense not found', async () => {
      (prisma.expense.findUnique as any).mockResolvedValue(null);
      await expect(expenseService.getExpenseById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listExpenses', () => {
    it('returns paginated list of expenses', async () => {
      const mockExpenses = [
        {
          id: 'exp-1', category: 'CLEANING', amount: 500n, date: new Date('2026-04-01'),
          description: 'Clean 1', paidTo: null, receiptNo: null, createdBy: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'exp-2', category: 'REPAIR', amount: 1500n, date: new Date('2026-04-02'),
          description: 'Repair 1', paidTo: null, receiptNo: null, createdBy: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ];

      (prisma.expense.count as any).mockResolvedValue(2);
      (prisma.expense.findMany as any).mockResolvedValue(mockExpenses);

      const result = await expenseService.listExpenses({
        page: 1, pageSize: 20, sortBy: 'date', sortOrder: 'desc',
      });

      expect(result.total).toBe(2);
      expect(result.data.length).toBe(2);
      expect(result.page).toBe(1);
    });

    it('filters by category when provided', async () => {
      (prisma.expense.count as any).mockResolvedValue(1);
      (prisma.expense.findMany as any).mockResolvedValue([
        {
          id: 'exp-1', category: 'UTILITY', amount: 3000n, date: new Date('2026-04-01'),
          description: 'Electricity bill', paidTo: 'PEA', receiptNo: null, createdBy: null,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]);

      const result = await expenseService.listExpenses({
        category: 'UTILITY', page: 1, pageSize: 20, sortBy: 'date', sortOrder: 'desc',
      });

      expect(result.total).toBe(1);
      expect(result.data[0].category).toBe('UTILITY');
    });
  });

  describe('getMonthlyExpenseSummary', () => {
    it('groups expenses by category', async () => {
      const mockExpenses = [
        { id: 'exp-1', category: 'CLEANING', amount: 500n, date: new Date('2026-04-01'), description: '', paidTo: null, receiptNo: null, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'exp-2', category: 'CLEANING', amount: 300n, date: new Date('2026-04-15'), description: '', paidTo: null, receiptNo: null, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'exp-3', category: 'REPAIR', amount: 2000n, date: new Date('2026-04-10'), description: '', paidTo: null, receiptNo: null, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      (prisma.expense.findMany as any).mockResolvedValue(mockExpenses);

      const result = await expenseService.getMonthlyExpenseSummary(2026, 4);

      expect(result.totalExpenses).toBe(2800);
      expect(result.categories.length).toBe(2);

      const cleaningCat = result.categories.find(c => c.category === 'CLEANING');
      expect(cleaningCat?.total).toBe(800);
      expect(cleaningCat?.count).toBe(2);

      const repairCat = result.categories.find(c => c.category === 'REPAIR');
      expect(repairCat?.total).toBe(2000);
      expect(repairCat?.count).toBe(1);
    });
  });

  describe('getProfitLossReport', () => {
    it('calculates profit/loss for the period', async () => {
      // Mock paid invoices
      const mockInvoices = [
        { id: 'inv-1', totalAmount: 15000n, status: 'PAID', paidAt: new Date('2026-04-15') },
        { id: 'inv-2', totalAmount: 12000n, status: 'PAID', paidAt: new Date('2026-04-20') },
      ];

      // Mock expenses
      const mockExpenses = [
        { id: 'exp-1', category: 'CLEANING', amount: 500n, date: new Date('2026-04-01'), description: '', paidTo: null, receiptNo: null, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
        { id: 'exp-2', category: 'STAFF_SALARY', amount: 8000n, date: new Date('2026-04-30'), description: '', paidTo: null, receiptNo: null, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
      ];

      // We need to spy on prisma.invoice.findMany
      (prisma.invoice as any) = { findMany: vi.fn().mockResolvedValue(mockInvoices) };
      (prisma.expense.findMany as any).mockResolvedValue(mockExpenses);

      const result = await expenseService.getProfitLossReport(2026, 4);

      expect(result.totalIncome).toBe(27000);
      expect(result.totalExpenses).toBe(8500);
      expect(result.netProfit).toBe(18500);
    });
  });

  describe('updateExpense', () => {
    it('updates expense fields', async () => {
      const existingExpense = {
        id: 'exp-1', category: 'CLEANING', amount: 500n, date: new Date('2026-04-01'),
        description: 'Old description', paidTo: null, receiptNo: null, createdBy: null,
        createdAt: new Date(), updatedAt: new Date(),
      };

      (prisma.expense.findUnique as any).mockResolvedValue(existingExpense);
      (prisma.expense.update as any).mockResolvedValue({
        ...existingExpense,
        description: 'Updated description',
        amount: 600n,
      });

      const result = await expenseService.updateExpense('exp-1', {
        description: 'Updated description',
        amount: 600,
      });

      expect(result.description).toBe('Updated description');
      expect(result.amount).toBe(600);
    });

    it('throws NotFoundError for nonexistent expense', async () => {
      (prisma.expense.findUnique as any).mockResolvedValue(null);
      await expect(expenseService.updateExpense('nonexistent', { amount: 100 })).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteExpense', () => {
    it('deletes existing expense', async () => {
      (prisma.expense.findUnique as any).mockResolvedValue({
        id: 'exp-1', category: 'CLEANING', amount: 500n, date: new Date(),
        description: '', paidTo: null, receiptNo: null, createdBy: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
      (prisma.expense.delete as any).mockResolvedValue({});

      await expect(expenseService.deleteExpense('exp-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundError for nonexistent expense', async () => {
      (prisma.expense.findUnique as any).mockResolvedValue(null);
      await expect(expenseService.deleteExpense('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });
});