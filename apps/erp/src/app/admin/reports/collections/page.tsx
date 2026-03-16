'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, BarChart2, RefreshCw, TrendingDown, Wallet } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RevenuePoint = {
  year: number;
  month: number;
  total?: number;
  invoiced?: number;
  collected?: number;
  outstanding?: number;
};

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

type Invoice = {
  id: string;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate?: string | null;
  issuedAt?: string | null;
  createdAt?: string;
};

type MonthRow = {
  year: number;
  month: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
};

type AgingBucket = {
  label: string;
  days: string;
  amount: number;
  count: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(amount: number | null | undefined): string {
  if (amount == null) return '฿0';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
  });
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function rateColor(rate: number): string {
  if (rate >= 90) return 'text-emerald-700';
  if (rate >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function rateBarColor(rate: number): string {
  if (rate >= 90) return 'bg-emerald-500';
  if (rate >= 70) return 'bg-amber-400';
  return 'bg-red-500';
}

function statusLabel(rate: number): { text: string; cls: string } {
  if (rate >= 90) return { text: 'Good', cls: 'bg-emerald-100 text-emerald-700' };
  if (rate >= 70) return { text: 'Fair', cls: 'bg-amber-100 text-amber-700' };
  return { text: 'Poor', cls: 'bg-red-100 text-red-700' };
}

function enrich(p: RevenuePoint): MonthRow {
  const collected = p.collected ?? p.total ?? 0;
  const invoiced = p.invoiced ?? collected;
  const outstanding = p.outstanding ?? Math.max(0, invoiced - collected);
  const collectionRate = pct(collected, invoiced);
  return { year: p.year, month: p.month, invoiced, collected, outstanding, collectionRate };
}

function ageDays(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function buildAging(overdueInvoices: Invoice[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: '0 – 30 days', days: '0-30', amount: 0, count: 0 },
    { label: '31 – 60 days', days: '31-60', amount: 0, count: 0 },
    { label: '61 – 90 days', days: '61-90', amount: 0, count: 0 },
    { label: '90+ days', days: '90+', amount: 0, count: 0 },
  ];

  for (const inv of overdueInvoices) {
    const days = ageDays(inv.dueDate ?? inv.issuedAt ?? inv.createdAt);
    if (days == null) continue;
    const amt = inv.totalAmount ?? 0;
    if (days <= 30) { buckets[0].amount += amt; buckets[0].count++; }
    else if (days <= 60) { buckets[1].amount += amt; buckets[1].count++; }
    else if (days <= 90) { buckets[2].amount += amt; buckets[2].count++; }
    else { buckets[3].amount += amt; buckets[3].count++; }
  }

  return buckets;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="admin-kpi">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="admin-kpi-label">{label}</div>
          <div className="admin-kpi-value">{value}</div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${iconBg} ${iconColor}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CollectionsReportPage() {
  const now = new Date();
  const [fromYear, setFromYear] = useState(now.getFullYear() - 1);
  const [fromMonth, setFromMonth] = useState(now.getMonth() + 1);
  const [toYear, setToYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);

  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [revRes, invRes] = await Promise.all([
        fetch('/api/analytics/revenue?months=12', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/invoices?status=OVERDUE&pageSize=100', { cache: 'no-store' }).then((r) =>
          r.json()
        ),
      ]);

      if (!revRes.success) throw new Error(revRes.error?.message || 'Unable to load revenue data');
      setRevenueData(revRes.data ?? []);

      if (invRes.success) {
        setOverdueInvoices(invRes.data?.data ?? invRes.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load collections data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter by date range
  const filtered = useMemo(() => {
    const from = fromYear * 100 + fromMonth;
    const to = toYear * 100 + toMonth;
    return revenueData.filter((p) => {
      const key = p.year * 100 + p.month;
      return key >= from && key <= to;
    });
  }, [revenueData, fromYear, fromMonth, toYear, toMonth]);

  const rows = useMemo<MonthRow[]>(
    () =>
      [...filtered.map(enrich)].sort(
        (a, b) => b.year * 100 + b.month - (a.year * 100 + a.month)
      ),
    [filtered]
  );

  // Summary
  const summary = useMemo(() => {
    const totalInvoiced = rows.reduce((s, r) => s + r.invoiced, 0);
    const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
    const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
    const collectionRate = pct(totalCollected, totalInvoiced);
    return { totalInvoiced, totalCollected, totalOutstanding, collectionRate };
  }, [rows]);

  // Aging analysis
  const agingBuckets = useMemo(() => buildAging(overdueInvoices), [overdueInvoices]);
  const maxAgingAmount = Math.max(...agingBuckets.map((b) => b.amount), 1);

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/reports"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="admin-page-title">Collections Report</h1>
            <p className="admin-page-subtitle">
              Monthly collection performance, outstanding balances, and aging analysis
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="admin-button flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </section>

      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Date range picker */}
      <section className="admin-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-slate-600">Date Range:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">From</span>
            <select
              value={fromMonth}
              onChange={(e) => setFromMonth(Number(e.target.value))}
              className="admin-select"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1).toLocaleString('en', { month: 'short' })}
                </option>
              ))}
            </select>
            <select
              value={fromYear}
              onChange={(e) => setFromYear(Number(e.target.value))}
              className="admin-select"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">To</span>
            <select
              value={toMonth}
              onChange={(e) => setToMonth(Number(e.target.value))}
              className="admin-select"
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1).toLocaleString('en', { month: 'short' })}
                </option>
              ))}
            </select>
            <select
              value={toYear}
              onChange={(e) => setToYear(Number(e.target.value))}
              className="admin-select"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-400">
            {rows.length} month{rows.length !== 1 ? 's' : ''} in range
          </span>
        </div>
      </section>

      {/* Summary KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Invoiced"
          value={loading ? '...' : money(summary.totalInvoiced)}
          sub="in selected period"
          icon={<BarChart2 className="h-5 w-5" />}
          iconBg="border-blue-200 bg-blue-50"
          iconColor="text-blue-600"
        />
        <KpiCard
          label="Total Collected"
          value={loading ? '...' : money(summary.totalCollected)}
          sub="payments received"
          icon={<Wallet className="h-5 w-5" />}
          iconBg="border-emerald-200 bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <KpiCard
          label="Collection Rate"
          value={
            loading ? '...' : (
              <span className={rateColor(summary.collectionRate)}>
                {summary.collectionRate}%
              </span>
            )
          }
          sub="collected / invoiced"
          icon={
            <span className={`text-sm font-bold ${rateColor(summary.collectionRate)}`}>
              {loading ? '?' : `${summary.collectionRate}%`}
            </span>
          }
          iconBg="border-violet-200 bg-violet-50"
          iconColor="text-violet-600"
        />
        <KpiCard
          label="Outstanding"
          value={loading ? '...' : money(summary.totalOutstanding)}
          sub="unpaid balance"
          icon={<TrendingDown className="h-5 w-5" />}
          iconBg="border-red-200 bg-red-50"
          iconColor="text-red-500"
        />
      </section>

      {/* Month-by-month table */}
      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title">Month-by-Month Collections</div>
          <span className="admin-badge">{rows.length} months</span>
        </div>
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Invoiced</th>
                <th>Collected</th>
                <th>Outstanding</th>
                <th>Collection Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading collections data...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No data in the selected range.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const sl = statusLabel(row.collectionRate);
                  return (
                    <tr key={`${row.year}-${row.month}`}>
                      <td>
                        <span className="font-medium text-slate-800">
                          {monthLabel(row.year, row.month)}
                        </span>
                      </td>
                      <td className="tabular-nums text-slate-700">{money(row.invoiced)}</td>
                      <td>
                        <span className="tabular-nums font-semibold text-emerald-700">
                          {money(row.collected)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            row.outstanding > 0
                              ? 'tabular-nums font-medium text-red-600'
                              : 'text-slate-400'
                          }
                        >
                          {money(row.outstanding)}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${rateBarColor(row.collectionRate)}`}
                              style={{ width: `${Math.min(row.collectionRate, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-sm font-semibold tabular-nums ${rateColor(row.collectionRate)}`}
                          >
                            {row.collectionRate}%
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${sl.cls}`}
                        >
                          {sl.text}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Aging analysis */}
      <section className="admin-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="admin-card-title">Aging Analysis</div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-sm text-slate-500">
              {overdueInvoices.length} overdue invoice{overdueInvoices.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading aging data...</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {agingBuckets.map((bucket) => {
              const barPct = maxAgingAmount > 0 ? (bucket.amount / maxAgingAmount) * 100 : 0;
              const isSerious = bucket.days === '90+';
              return (
                <div
                  key={bucket.days}
                  className={`rounded-2xl border p-4 ${
                    isSerious
                      ? 'border-red-200 bg-red-50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {bucket.label}
                  </div>
                  <div
                    className={`text-2xl font-bold tabular-nums ${
                      isSerious ? 'text-red-700' : 'text-slate-800'
                    }`}
                  >
                    {money(bucket.amount)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {bucket.count} invoice{bucket.count !== 1 ? 's' : ''}
                  </div>
                  {/* Relative bar */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isSerious ? 'bg-red-500' : 'bg-slate-400'
                      }`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && overdueInvoices.length === 0 && (
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700 mt-2">
            No overdue invoices. All collections are up to date.
          </p>
        )}
      </section>
    </main>
  );
}
