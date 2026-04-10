'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import React from 'react';
import {
  AlertTriangle,
  BarChart2,
  ChevronDown,
  DollarSign,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExpenseCategory = 'CLEANING' | 'REPAIR' | 'UTILITY' | 'STAFF_SALARY' | 'MANAGEMENT' | 'OTHER';

interface ProfitLossReport {
  year: number;
  month: number;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  incomeByCategory: { category: string; total: number }[];
  expenseByCategory: { category: ExpenseCategory; categoryLabel: string; total: number }[];
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
  CLEANING: 'bg-blue-500',
  REPAIR: 'bg-amber-500',
  UTILITY: 'bg-green-500',
  STAFF_SALARY: 'bg-purple-500',
  MANAGEMENT: 'bg-pink-500',
  OTHER: 'bg-gray-500',
};

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
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
// Main Page
// ---------------------------------------------------------------------------

export default function AdminProfitLossPage() {
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>('');

  const monthOptions = getMonthOptions();

  const loadReport = useCallback(async () => {
    if (!monthFilter) return;
    setLoading(true);
    setError(null);
    try {
      const [y, m] = monthFilter.split('-');
      const res = await fetch(`/api/reports/profit-loss?year=${y}&month=${m}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load report: ${res.status}`);
      const json = await res.json();
      setReport(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [monthFilter]);

  useEffect(() => {
    if (monthOptions.length > 0 && !monthFilter) {
      setMonthFilter(monthOptions[0].value);
    }
  }, [monthOptions, monthFilter]);

  useEffect(() => {
    if (monthFilter) {
      void loadReport();
    }
  }, [loadReport, monthFilter]);

  // Calculate chart data
  const expenseChartData = report
    ? report.expenseByCategory.map((item) => ({
        label: item.categoryLabel,
        value: item.total,
        color: CATEGORY_COLORS[item.category] ?? 'bg-gray-500',
      }))
    : [];

  const maxExpenseValue = Math.max(...expenseChartData.map((d) => d.value), 1);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--on-surface)]">รายงานกำไร/ขาดทุน</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">รายได้ vs รายจ่าย รายเดือน</p>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={() => void loadReport()}
            disabled={loading || !monthFilter}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-[var(--error-container)]/10 border border-[var(--error-container)]/20 text-sm text-[var(--color-danger)] font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {report && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Income */}
          <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-all">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">รายได้</p>
                <p className="mt-0.5 text-2xl font-bold text-[var(--on-surface)]">฿{formatBaht(report.totalIncome)}</p>
                <p className="mt-0.5 text-xs text-[var(--on-surface-variant)]">{thaiMonthYear(report.year, report.month)}</p>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-all">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--error-container)] text-[var(--on-error-container)]">
                <TrendingDown className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">รายจ่าย</p>
                <p className="mt-0.5 text-2xl font-bold text-[var(--on-surface)]">฿{formatBaht(report.totalExpenses)}</p>
                <p className="mt-0.5 text-xs text-[var(--on-surface-variant)]">{thaiMonthYear(report.year, report.month)}</p>
              </div>
            </div>
          </div>

          {/* Net Profit */}
          <div className={`rounded-xl border p-5 hover:shadow-lg transition-all ${
            report.netProfit >= 0
              ? 'bg-[var(--tertiary-container)]/30 border-[var(--tertiary-container)]/20'
              : 'bg-[var(--error-container)]/30 border-[var(--error-container)]/20'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                report.netProfit >= 0 ? 'bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]' : 'bg-[var(--error-container)] text-[var(--on-error-container)]'
              }`}>
                <BarChart2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">กำไรสุทธิ</p>
                <p className={`mt-0.5 text-2xl font-bold ${report.netProfit >= 0 ? 'text-[var(--tertiary-container)]' : 'text-[var(--color-danger)]-container'}`}>
                  ฿{formatBaht(Math.abs(report.netProfit))}
                  {report.netProfit < 0 && <span className="text-sm ml-1">(ขาดทุน)</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Expense Count */}
          <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-all">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-[var(--on-surface-variant)]">
                <DollarSign className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">จำนวนรายการ</p>
                <p className="mt-0.5 text-2xl font-bold text-[var(--on-surface)]">{report.expenseByCategory.reduce((s, c) => s + 1, 0)}</p>
                <p className="mt-0.5 text-xs text-[var(--on-surface-variant)]">หมวดหมู่</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
        </div>
      )}

      {/* Report Content */}
      {!loading && report && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Expense Breakdown */}
          <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5">
            <h3 className="text-lg font-semibold text-[var(--on-surface)] mb-4">รายจ่ายตามหมวดหมู่</h3>
            {expenseChartData.length === 0 ? (
              <p className="text-sm text-[var(--on-surface-variant)] text-center py-8">ไม่มีข้อมูลรายจ่าย</p>
            ) : (
              <div className="space-y-3">
                {expenseChartData.map((item) => {
                  const pct = Math.round((item.value / maxExpenseValue) * 100);
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--on-surface)]">{item.label}</span>
                        <span className="font-semibold text-[var(--on-surface)]">฿{formatBaht(item.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface overflow-hidden">
                        <div
                          className={`h-full rounded-full ${item.color}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Income vs Expense Summary */}
          <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5">
            <h3 className="text-lg font-semibold text-[var(--on-surface)] mb-4">สรุป {thaiMonthYear(report.year, report.month)}</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-[var(--outline-variant)]/50">
                <span className="text-[var(--on-surface-variant)]">รายได้ค่าเช่า</span>
                <span className="font-semibold text-[var(--on-surface)]">฿{formatBaht(report.totalIncome)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-[var(--outline-variant)]/50">
                <span className="text-[var(--on-surface-variant)]">รายจ่ายรวม</span>
                <span className="font-semibold text-[var(--color-danger)]">−฿{formatBaht(report.totalExpenses)}</span>
              </div>
              <div className="flex justify-between items-center py-3 font-bold">
                <span className="text-[var(--on-surface)]">กำไรสุทธิ</span>
                <span className={`text-xl ${report.netProfit >= 0 ? 'text-[var(--tertiary-container)]' : 'text-[var(--color-danger)]-container'}`}>
                  ฿{formatBaht(report.netProfit)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No report yet */}
      {!loading && !report && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BarChart2 className="mb-3 h-12 w-12 text-outline-variant" />
          <p className="font-semibold text-[var(--on-surface)]">เลือกเดือนเพื่อดูรายงาน</p>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">รายงานจะแสดงรายได้และรายจ่ายประจำเดือน</p>
        </div>
      )}
    </main>
  );
}