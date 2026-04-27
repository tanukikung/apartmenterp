'use client';

import { useCallback, useEffect, useState } from 'react';

import React from 'react';
import {
  AlertTriangle,
  BarChart2,
  ChevronDown,
  DollarSign,
  Download,
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

const _CATEGORY_LABELS: Record<ExpenseCategory, string> = {
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
  UTILITY: 'bg-emerald-500',
  STAFF_SALARY: 'bg-violet-500',
  MANAGEMENT: 'bg-pink-500',
  OTHER: 'bg-white/30',
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
// Glass Card
// ---------------------------------------------------------------------------

function GlassCard({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={[
      'rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--color-surface))] backdrop-blur-sm',
      'shadow-[0_4px_16px_rgba(0,0,0,0.08)]',
      hover ? 'hover:bg-[hsl(var(--color-surface))] hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:scale-[1.01] transition-all duration-200 cursor-pointer' : '',
      className,
    ].join(' ')}>
      {children}
    </div>
  );
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

  // Export CSV
  function exportCSV() {
    if (!report) return;
    const rows = [
      ['เดือน', 'รายได้ทั้งหมด', 'ค่าใช้จ่าย', 'กำไรสุทธิ'],
      [
        thaiMonthYear(report.year, report.month),
        report.totalIncome,
        report.totalExpenses,
        report.netProfit,
      ],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit-loss-${report.year}-${report.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Calculate chart data
  const expenseChartData = report
    ? report.expenseByCategory.map((item) => ({
        label: item.categoryLabel,
        value: item.total,
        color: CATEGORY_COLORS[item.category] ?? 'bg-white/30',
      }))
    : [];

  const maxExpenseValue = Math.max(...expenseChartData.map((d) => d.value), 1);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))]/20 to-[hsl(var(--primary))]/10 px-6 py-5 shadow-[var(--glass-shadow))] backdrop-blur-sm border border-[hsl(var(--glass-border))]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.1),_transparent_60%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary))]/20 ring-1 ring-[hsl(var(--primary))]/30 shadow-[0_4px_16px_rgba(99,102,241,0.15)]">
              <BarChart2 className="h-5 w-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--card-foreground))]">รายงานกำไร/ขาดทุน</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">รายได้ vs รายจ่าย รายเดือน</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="appearance-none rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--color-surface))] py-2 pl-3 pr-8 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur-sm"
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[hsl(var(--color-surface))]">{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--on-surface-variant))]" />
            </div>
            <button
              onClick={() => void loadReport()}
              disabled={loading || !monthFilter}
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:bg-[hsl(var(--primary))]/10 active:scale-95 disabled:opacity-40"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => exportCSV()}
              disabled={loading || !report}
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:bg-[hsl(var(--primary))]/10 active:scale-95 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              ส่งออก CSV
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        </GlassCard>
      )}

      {/* KPI Cards */}
      {report && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Income */}
          <GlassCard className="p-5" hover>
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_4px_16px_rgba(34,197,94,0.15)]">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">รายได้</p>
                <p className="mt-0.5 text-2xl font-bold text-[hsl(var(--card-foreground))]">฿{formatBaht(report.totalIncome)}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--on-surface-variant))]">{thaiMonthYear(report.year, report.month)}</p>
              </div>
            </div>
          </GlassCard>

          {/* Expenses */}
          <GlassCard className="p-5" hover>
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 shadow-[0_4px_16px_rgba(239,68,68,0.15)]">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">รายจ่าย</p>
                <p className="mt-0.5 text-2xl font-bold text-[hsl(var(--card-foreground))]">฿{formatBaht(report.totalExpenses)}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--on-surface-variant))]">{thaiMonthYear(report.year, report.month)}</p>
              </div>
            </div>
          </GlassCard>

          {/* Net Profit */}
          <GlassCard className={`p-5 ${report.netProfit >= 0 ? 'hover' : ''}`} hover>
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${report.netProfit >= 0 ? 'border-indigo-500/30 bg-indigo-500/10 shadow-glow-primary' : 'border-red-500/30 bg-red-500/10 shadow-[0_4px_16px_rgba(239,68,68,0.15)]'}`}>
                <BarChart2 className={`h-5 w-5 ${report.netProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">กำไรสุทธิ</p>
                <p className={`mt-0.5 text-2xl font-bold ${report.netProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                  ฿{formatBaht(Math.abs(report.netProfit))}
                  {report.netProfit < 0 && <span className="text-sm ml-1 text-red-600/70">(ขาดทุน)</span>}
                </p>
              </div>
            </div>
          </GlassCard>

          {/* Expense Count */}
          <GlassCard className="p-5" hover>
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--color-surface))]">
                <DollarSign className="h-5 w-5 text-[hsl(var(--on-surface-variant))]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">จำนวนหมวดหมู่</p>
                <p className="mt-0.5 text-2xl font-bold text-[hsl(var(--card-foreground))]">{report.expenseByCategory.reduce((s, _c) => s + 1, 0)}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--on-surface-variant))]">หมวดหมู่</p>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 shadow-[0_4px_16px_rgba(99,102,241,0.25)]" />
        </div>
      )}

      {/* Report Content */}
      {!loading && report && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Expense Breakdown */}
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-[hsl(var(--card-foreground))] mb-4">รายจ่ายตามหมวดหมู่</h3>
            {expenseChartData.length === 0 ? (
              <p className="text-sm text-[hsl(var(--on-surface-variant))] text-center py-8">ไม่มีข้อมูลรายจ่าย</p>
            ) : (
              <div className="space-y-3">
                {expenseChartData.map((item) => {
                  const pct = Math.round((item.value / maxExpenseValue) * 100);
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-[hsl(var(--on-surface-variant))]">{item.label}</span>
                        <span className="font-semibold text-[hsl(var(--card-foreground))]">฿{formatBaht(item.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[hsl(var(--color-surface))] overflow-hidden">
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
          </GlassCard>

          {/* Income vs Expense Summary */}
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-[hsl(var(--card-foreground))] mb-4">สรุป {thaiMonthYear(report.year, report.month)}</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-[hsl(var(--glass-border))]">
                <span className="text-[hsl(var(--on-surface-variant))]">รายได้ค่าเช่า</span>
                <span className="font-semibold text-[hsl(var(--card-foreground))]">฿{formatBaht(report.totalIncome)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-[hsl(var(--glass-border))]">
                <span className="text-[hsl(var(--on-surface-variant))]">รายจ่ายรวม</span>
                <span className="font-semibold text-red-600">−฿{formatBaht(report.totalExpenses)}</span>
              </div>
              <div className="flex justify-between items-center py-3 font-bold">
                <span className="text-[hsl(var(--card-foreground))]">กำไรสุทธิ</span>
                <span className={`text-xl ${report.netProfit >= 0 ? 'text-indigo-600' : 'text-red-600'}`}>
                  ฿{formatBaht(report.netProfit)}
                </span>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* No report yet */}
      {!loading && !report && !error && (
        <GlassCard className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--color-surface))] mb-4 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
            <BarChart2 className="h-7 w-7 text-indigo-600" />
          </div>
          <p className="font-semibold text-[hsl(var(--card-foreground))]">เลือกเดือนเพื่อดูรายงาน</p>
          <p className="mt-1 text-sm text-[hsl(var(--on-surface-variant))]">รายงานจะแสดงรายได้และรายจ่ายประจำเดือน</p>
        </GlassCard>
      )}
    </main>
  );
}
