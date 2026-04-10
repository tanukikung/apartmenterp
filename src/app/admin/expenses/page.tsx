'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClientOnly } from '@/components/ui/ClientOnly';
import React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  FileSpreadsheet,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Edit2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExpenseCategory = 'CLEANING' | 'REPAIR' | 'UTILITY' | 'STAFF_SALARY' | 'MANAGEMENT' | 'OTHER';

interface Expense {
  id: string;
  category: ExpenseCategory;
  categoryLabel: string;
  amount: number;
  date: string;
  description: string;
  paidTo: string | null;
  receiptNo: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface ExpenseListResponse {
  data: Expense[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  CLEANING: 'ทำความสะอาด',
  REPAIR: 'ซ่อมแซม',
  UTILITY: 'ค่าสาธารณูปโภค',
  STAFF_SALARY: 'เงินเดือนพนักงาน',
  MANAGEMENT: 'ค่าบริหารจัดการ',
  OTHER: 'อื่นๆ',
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  CLEANING: 'bg-blue-100 text-blue-700',
  REPAIR: 'bg-amber-100 text-amber-700',
  UTILITY: 'bg-green-100 text-green-700',
  STAFF_SALARY: 'bg-purple-100 text-purple-700',
  MANAGEMENT: 'bg-pink-100 text-pink-700',
  OTHER: 'bg-gray-100 text-gray-700',
};

const CATEGORY_OPTIONS: { value: ExpenseCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'ทุกหมวดหมู่' },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value: value as ExpenseCategory,
    label,
  })),
];

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [{ value: 'ALL', label: 'ทุกเดือน' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    options.push({
      value: `${y}-${String(m).padStart(2, '0')}`,
      label: `${THAI_MONTHS[m - 1]} ${y + 543}`,
    });
  }
  return options;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBaht(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function thaiMonthYear(year: number, month: number): string {
  const m = THAI_MONTHS[month - 1] ?? String(month);
  return `${m} ${year + 543}`;
}

// ---------------------------------------------------------------------------
// Category Badge
// ---------------------------------------------------------------------------

function CategoryBadge({ category }: { category: ExpenseCategory }) {
  const label = CATEGORY_LABELS[category] ?? category;
  const colorClass = CATEGORY_COLORS[category] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'ALL'>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const monthOptions = getMonthOptions();

  // ---------------------------------------------------------------------------
  // Load expenses
  // ---------------------------------------------------------------------------

  const loadExpenses = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        pageSize: '20',
        sortBy: 'date',
        sortOrder: 'desc',
      });

      if (categoryFilter !== 'ALL') {
        params.set('category', categoryFilter);
      }
      if (monthFilter !== 'ALL') {
        const [y, m] = monthFilter.split('-');
        params.set('year', y);
        params.set('month', m);
      }

      const res = await fetch(`/api/expenses?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
      const json: ExpenseListResponse = await res.json();

      setExpenses(json.data);
      setTotal(json.total);
      setPage(json.page);
      setTotalPages(json.totalPages);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, monthFilter]);

  useEffect(() => {
    void loadExpenses(1);
  }, [loadExpenses]);

  // ---------------------------------------------------------------------------
  // Filtered list
  // ---------------------------------------------------------------------------

  const filteredExpenses = expenses.filter((e) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        e.description.toLowerCase().includes(q) ||
        (e.paidTo?.toLowerCase().includes(q) ?? false) ||
        (e.receiptNo?.toLowerCase().includes(q) ?? false) ||
        e.categoryLabel.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // Delete expense
  // ---------------------------------------------------------------------------

  async function handleDelete(id: string) {
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setDeleteSuccess('ลบรายการสำเร็จแล้ว');
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
      void loadExpenses(page);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setDeleteLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--on-surface)]">รายจ่าย</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">บันทึกและจัดการค่าใช้จ่าย</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            เพิ่มรายจ่าย
          </button>
          <button
            onClick={() => void loadExpenses(page)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {deleteError && (
        <div className="px-4 py-3 rounded-lg bg-[var(--error-container)]/10 border border-[var(--error-container)]/20 text-sm text-[var(--color-danger)] font-medium">
          {deleteError}
        </div>
      )}
      {deleteSuccess && (
        <div className="px-4 py-3 rounded-lg bg-[var(--tertiary-container)]/10 border border-[var(--tertiary-container)]/20 text-sm text-[var(--tertiary-container)] font-medium">
          {deleteSuccess}
        </div>
      )}
      {formError && (
        <div className="px-4 py-3 rounded-lg bg-[var(--error-container)]/10 border border-[var(--error-container)]/20 text-sm text-[var(--color-danger)] font-medium">
          {formError}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--on-surface-variant)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาค่าใช้จ่าย..."
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 pl-9 pr-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | 'ALL')}
            className="appearance-none rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 pl-3 pr-8 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--on-surface-variant)]" />
        </div>
        <div className="relative">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="appearance-none rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 pl-3 pr-8 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--on-surface-variant)]" />
        </div>
        {(categoryFilter !== 'ALL' || monthFilter !== 'ALL' || search) && (
          <button
            onClick={() => { setCategoryFilter('ALL'); setMonthFilter('ALL'); setSearch(''); }}
            className="rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--surface-container)]"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Summary */}
      {!loading && (
        <div className="flex gap-4 text-sm text-[var(--on-surface-variant)]">
          <span>แสดง {filteredExpenses.length} รายการ</span>
          <span>•</span>
          <span>รวม: ฿{formatBaht(filteredExpenses.reduce((s, e) => s + e.amount, 0))}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileSpreadsheet className="mb-3 h-12 w-12 text-outline-variant" />
            <p className="font-semibold text-[var(--on-surface)]">ยังไม่มีรายจ่าย</p>
            <p className="mt-1 text-sm text-[var(--on-surface-variant)]">เพิ่มรายจ่ายเพื่อติดตามการเงิน</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              เพิ่มรายจ่าย
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--outline-variant)]">
                  {['วันที่', 'หมวดหมู่', 'รายละเอียด', 'จ่ายให้', 'เลขที่ใบเสร็จ', 'จำนวน', 'จัดการ'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => {
                  const d = new Date(expense.date);
                  return (
                    <tr key={expense.id} className="border-b border-[var(--outline-variant)]/5 hover:bg-[var(--surface-container)]/50 transition-colors">
                      <td className="px-4 py-3 text-[var(--on-surface)] whitespace-nowrap">
                        <ClientOnly fallback={<span className="text-outline">—</span>}>
                          {d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </ClientOnly>
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={expense.category} />
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface)] max-w-xs truncate">
                        {expense.description}
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)]">
                        {expense.paidTo ?? <span className="text-outline">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[var(--on-surface-variant)] font-mono text-xs">
                        {expense.receiptNo ?? <span className="text-outline">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--on-surface)] whitespace-nowrap">
                        ฿{formatBaht(expense.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setDeleteTargetId(expense.id);
                              setDeleteConfirmOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] p-2 text-xs text-[var(--color-danger)] transition-colors hover:bg-[var(--error-container)]/10"
                            title="ลบ"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => void loadExpenses(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)] disabled:opacity-40"
          >
            ก่อนหน้า
          </button>
          <span className="text-sm text-[var(--on-surface-variant)]">
            หน้า {page} จาก {totalPages}
          </span>
          <button
            onClick={() => void loadExpenses(page + 1)}
            disabled={page >= totalPages}
            className="rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)] disabled:opacity-40"
          >
            ถัดไป
          </button>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-[var(--surface-container-lowest)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--on-surface)]">ยืนยันการลบ?</h3>
            <p className="mt-2 text-sm text-[var(--on-surface-variant)]">
              การลบรายการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setDeleteConfirmOpen(false); setDeleteTargetId(null); }}
                className="rounded-lg border border-[var(--outline)] px-4 py-2 text-sm text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => { if (deleteTargetId) void handleDelete(deleteTargetId); }}
                disabled={deleteLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-danger)]/90 disabled:opacity-60"
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <ExpenseFormModal
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            void loadExpenses(1);
          }}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Expense Form Modal
// ---------------------------------------------------------------------------

function ExpenseFormModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory>('OTHER');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          amount: parseFloat(amount),
          date,
          description,
          paidTo: paidTo || undefined,
          receiptNo: receiptNo || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message || 'Failed to create expense');
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-[var(--surface-container-lowest)] p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-[var(--on-surface)]">เพิ่มรายจ่าย</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-[var(--error-container)]/10 border border-[var(--error-container)]/20 text-sm text-[var(--color-danger)]">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">หมวดหมู่</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 px-3 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none"
              >
                {CATEGORY_OPTIONS.filter(o => o.value !== 'ALL').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">จำนวน (บาท)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 px-3 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">วันที่</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 px-3 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">รายละเอียด</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 px-3 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">จ่ายให้ (ไม่บังคับ)</label>
              <input
                type="text"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 px-3 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--on-surface-variant)] mb-1">เลขที่ใบเสร็จ (ไม่บังคับ)</label>
              <input
                type="text"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 px-3 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--outline)] px-4 py-2 text-sm text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}