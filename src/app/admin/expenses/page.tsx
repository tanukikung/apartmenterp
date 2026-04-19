'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ClientOnly } from '@/components/ui/ClientOnly';
import React from 'react';
import { ChevronDown, FileSpreadsheet, Loader2, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { BulkActions } from '@/components/ui/bulk-actions';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/providers/ToastProvider';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useUrlState } from '@/hooks/useUrlState';

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

function _thaiMonthYear(year: number, month: number): string {
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
  const queryClient = useQueryClient();
  const [page, setPage] = useUrlState<number>('page', 1);
  const [totalPages, _setTotalPages] = useState(1);
  const [categoryFilter, setCategoryFilter] = useUrlState<ExpenseCategory | 'ALL'>('category', 'ALL');
  const [monthFilter, setMonthFilter] = useUrlState<string>('month', 'ALL');
  const [search, setSearch] = useUrlState<string>('q', '');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [_formLoading, _setFormLoading] = useState(false);
  const [formError, _setFormError] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const toast = useToast();

  const monthOptions = getMonthOptions();

  // ---------------------------------------------------------------------------
  // Load expenses with useQuery
  // ---------------------------------------------------------------------------

  const loadExpenses = useCallback(async (pageNum: number = 1) => {
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
    return json;
  }, [categoryFilter, monthFilter]);

  const { data: expensesData, isLoading, refetch } = useQuery<ExpenseListResponse>({
    queryKey: ['expenses', page, categoryFilter, monthFilter],
    queryFn: () => loadExpenses(page),
  });

  const expenses: Expense[] = expensesData?.data ?? [];
  const _total = expensesData?.total ?? 0;

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
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
        if (res.ok) ok += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkDeleting(false);
    setBulkDeleteConfirm(false);
    setSelectedIds(new Set());
    if (failed === 0) toast.success(`ลบรายการ ${ok} ชิ้น สำเร็จ`);
    else toast.warning(`ลบสำเร็จ ${ok} · ล้มเหลว ${failed}`);
    void queryClient.invalidateQueries({ queryKey: ['expenses'] });
  }

  const toggleSelectExpense = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">รายจ่าย</h1>
          <p className="mt-1 text-sm text-on-surface-variant">บันทึกและจัดการค่าใช้จ่าย</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            เพิ่มรายจ่าย
          </button>
          <button
            onClick={() => void refetch()}
            disabled={isLoading}
            aria-label="รีเฟรช"
            title="รีเฟรช"
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {deleteError && (
        <div className="px-4 py-3 rounded-lg bg-error-container/10 border border-error-container/20 text-sm text-color-danger font-medium">
          {deleteError}
        </div>
      )}
      {deleteSuccess && (
        <div className="px-4 py-3 rounded-lg bg-tertiary-container/10 border border-tertiary-container/20 text-sm text-tertiary-container font-medium">
          {deleteSuccess}
        </div>
      )}
      {formError && (
        <div className="px-4 py-3 rounded-lg bg-error-container/10 border border-error-container/20 text-sm text-color-danger font-medium">
          {formError}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาค่าใช้จ่าย..."
            className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 pl-9 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | 'ALL')}
            className="appearance-none rounded-lg border border-outline bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
        </div>
        <div className="relative">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="appearance-none rounded-lg border border-outline bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
        </div>
        {(categoryFilter !== 'ALL' || monthFilter !== 'ALL' || search) && (
          <button
            onClick={() => { setCategoryFilter('ALL'); setMonthFilter('ALL'); setSearch(''); }}
            className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* Summary */}
      {!isLoading && (
        <div className="flex gap-4 text-sm text-on-surface-variant">
          <span>แสดง {filteredExpenses.length} รายการ</span>
          <span>•</span>
          <span>รวม: ฿{formatBaht(filteredExpenses.reduce((s, e) => s + e.amount, 0))}</span>
        </div>
      )}

      {/* Bulk Actions */}
      <BulkActions
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: 'ลบที่เลือก',
            variant: 'danger',
            icon: <Trash2 className="h-3.5 w-3.5" />,
            onClick: () => setBulkDeleteConfirm(true),
          },
        ]}
      />

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        {isLoading ? (
          <SkeletonTable rows={6} />
        ) : filteredExpenses.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet className="h-7 w-7" />}
            title={search || categoryFilter !== 'ALL' || monthFilter !== 'ALL' ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีรายจ่าย'}
            description={search || categoryFilter !== 'ALL' || monthFilter !== 'ALL' ? 'ลองปรับตัวกรองหรือล้างการค้นหา' : 'เพิ่มรายจ่ายเพื่อติดตามการเงิน'}
            action={{ label: 'เพิ่มรายจ่าย', onClick: () => setShowForm(true) }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="เลือกทั้งหมด"
                      className="h-4 w-4 rounded border-outline text-primary focus:ring-primary/30"
                      checked={filteredExpenses.length > 0 && filteredExpenses.every((e) => selectedIds.has(e.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(filteredExpenses.map((x) => x.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                  </th>
                  {[
                    { key: 'วันที่', cls: '' },
                    { key: 'หมวดหมู่', cls: '' },
                    { key: 'รายละเอียด', cls: '' },
                    { key: 'จ่ายให้', cls: 'hidden lg:table-cell' },
                    { key: 'เลขที่ใบเสร็จ', cls: 'hidden lg:table-cell' },
                    { key: 'จำนวน', cls: '' },
                    { key: 'จัดการ', cls: '' },
                  ].map(({ key, cls }) => (
                    <th key={key} className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant ${cls}`}>
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense) => {
                  const d = new Date(expense.date);
                  return (
                    <tr key={expense.id} className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                      <td className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`เลือก ${expense.description}`}
                          className="h-4 w-4 rounded border-outline text-primary focus:ring-primary/30"
                          checked={selectedIds.has(expense.id)}
                          onChange={() => toggleSelectExpense(expense.id)}
                        />
                      </td>
                      <td className="px-4 py-3 text-on-surface whitespace-nowrap">
                        <ClientOnly fallback={<span className="text-outline">—</span>}>
                          {d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </ClientOnly>
                      </td>
                      <td className="px-4 py-3">
                        <CategoryBadge category={expense.category} />
                      </td>
                      <td className="px-4 py-3 text-on-surface max-w-xs truncate">
                        {expense.description}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-on-surface-variant">
                        {expense.paidTo ?? <span className="text-outline">—</span>}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-on-surface-variant font-mono text-xs">
                        {expense.receiptNo ?? <span className="text-outline">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-on-surface whitespace-nowrap">
                        ฿{formatBaht(expense.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setDeleteTargetId(expense.id);
                              setDeleteConfirmOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest p-2 text-xs text-color-danger transition-colors hover:bg-error-container/10"
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
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
          >
            ก่อนหน้า
          </button>
          <span className="text-sm text-on-surface-variant">
            หน้า {page} จาก {expensesData?.totalPages ?? 1}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= (expensesData?.totalPages ?? 1)}
            className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
          >
            ถัดไป
          </button>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-on-surface">ยืนยันการลบ?</h3>
            <p className="mt-2 text-sm text-on-surface-variant">
              การลบรายการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setDeleteConfirmOpen(false); setDeleteTargetId(null); }}
                className="rounded-lg border border-outline px-4 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => { if (deleteTargetId) void handleDelete(deleteTargetId); }}
                disabled={deleteLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-color-danger px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-color-danger/90 disabled:opacity-60"
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                ลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirm */}
      <ConfirmDialog
        open={bulkDeleteConfirm}
        title={`ลบรายการ ${selectedIds.size} รายการ?`}
        description="การลบไม่สามารถย้อนกลับได้"
        confirmLabel="ลบทั้งหมด"
        cancelLabel="ยกเลิก"
        dangerous
        loading={bulkDeleting}
        onConfirm={() => void handleBulkDelete()}
        onCancel={() => setBulkDeleteConfirm(false)}
      />

      {/* Add/Edit Form Modal */}
      {showForm && (
        <ExpenseFormModal
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            void queryClient.invalidateQueries({ queryKey: ['expenses'] });
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
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warn on unload while user has drafted an expense
  const dirty = !loading && (amount !== null || description !== '' || paidTo !== '' || receiptNo !== '');
  useUnsavedChanges(dirty);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (amount === null || amount <= 0) {
        throw new Error('กรุณากรอกจำนวนเงิน');
      }
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          amount,
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
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-on-surface">เพิ่มรายจ่าย</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-error-container/10 border border-error-container/20 text-sm text-color-danger">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">หมวดหมู่</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 px-3 text-sm text-on-surface focus:border-primary focus:outline-none"
              >
                {CATEGORY_OPTIONS.filter(o => o.value !== 'ALL').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">จำนวน (บาท)</label>
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                required
                ariaLabel="จำนวนเงิน"
                className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 px-3 text-sm text-on-surface focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-1">วันที่</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 px-3 text-sm text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface-variant mb-1">รายละเอียด</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={3}
              className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 px-3 text-sm text-on-surface focus:border-primary focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">จ่ายให้ (ไม่บังคับ)</label>
              <input
                type="text"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 px-3 text-sm text-on-surface focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1">เลขที่ใบเสร็จ (ไม่บังคับ)</label>
              <input
                type="text"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 px-3 text-sm text-on-surface focus:border-primary focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-outline px-4 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
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