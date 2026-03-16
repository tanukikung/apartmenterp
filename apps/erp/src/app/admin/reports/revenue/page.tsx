'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpDown, BarChart2, TrendingUp, Wallet } from 'lucide-react';

type RevenuePoint = {
  year: number;
  month: number;
  total: number;
  // Some API shapes return these; treat as optional
  invoiced?: number;
  collected?: number;
  outstanding?: number;
};

type SortField = 'month' | 'invoiced' | 'collected' | 'outstanding';
type SortDir = 'asc' | 'desc';

function money(amount: number): string {
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

function padMonth(m: number): string {
  return String(m).padStart(2, '0');
}

/** Derive invoiced / collected / outstanding from the API shape.
 *  The analytics/revenue endpoint returns { year, month, total } where
 *  total = paid amount. We treat total as collected and use it for both
 *  invoiced (estimate) unless richer fields are present.
 */
function enrich(point: RevenuePoint) {
  const collected = point.collected ?? point.total ?? 0;
  const invoiced = point.invoiced ?? collected;
  const outstanding = point.outstanding ?? Math.max(0, invoiced - collected);
  return { ...point, invoiced, collected, outstanding };
}

export default function AdminRevenueReportPage() {
  const [data, setData] = useState<RevenuePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: 'month',
    dir: 'desc',
  });

  // Date range state (default: last 12 months)
  const now = new Date();
  const [fromYear, setFromYear] = useState(
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() - 1
  );
  const [fromMonth, setFromMonth] = useState(
    now.getMonth() === 0 ? 12 : now.getMonth()
  );
  const [toYear, setToYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/revenue?months=24', {
        cache: 'no-store',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to load revenue data');
      setData(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load revenue data');
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
    return data.filter((p) => {
      const key = p.year * 100 + p.month;
      return key >= from && key <= to;
    });
  }, [data, fromYear, fromMonth, toYear, toMonth]);

  // Enrich and sort
  const rows = useMemo(() => {
    const enriched = filtered.map(enrich);
    return [...enriched].sort((a, b) => {
      let va: number, vb: number;
      if (sort.field === 'month') {
        va = a.year * 100 + a.month;
        vb = b.year * 100 + b.month;
      } else {
        va = a[sort.field];
        vb = b[sort.field];
      }
      return sort.dir === 'asc' ? va - vb : vb - va;
    });
  }, [filtered, sort]);

  const summary = useMemo(() => {
    const enriched = filtered.map(enrich);
    const total = enriched.reduce((s, r) => s + r.collected, 0);
    const avg = enriched.length > 0 ? Math.round(total / enriched.length) : 0;
    const best = enriched.reduce(
      (b, r) => (r.collected > (b?.collected ?? -1) ? r : b),
      null as ReturnType<typeof enrich> | null
    );
    return { total, avg, best };
  }, [filtered]);

  function toggleSort(field: SortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'desc' }
    );
  }

  function SortIcon({ field }: { field: SortField }) {
    return (
      <ArrowUpDown
        className={`ml-1 inline h-3.5 w-3.5 ${
          sort.field === field ? 'text-indigo-600' : 'text-slate-400'
        }`}
      />
    );
  }

  // Simple CSS bar chart helpers
  const maxCollected = Math.max(...rows.map((r) => r.collected), 1);

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
  const YEARS = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

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
            <h1 className="admin-page-title">Revenue Report</h1>
            <p className="admin-page-subtitle">Monthly invoiced, collected, and outstanding amounts</p>
          </div>
        </div>
        <button onClick={() => void load()} className="admin-button">
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
                  {new Date(2000, m - 1, 1).toLocaleString('en', { month: 'short' })}
                </option>
              ))}
            </select>
            <select
              value={fromYear}
              onChange={(e) => setFromYear(Number(e.target.value))}
              className="admin-select"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
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
                  {new Date(2000, m - 1, 1).toLocaleString('en', { month: 'short' })}
                </option>
              ))}
            </select>
            <select
              value={toYear}
              onChange={(e) => setToYear(Number(e.target.value))}
              className="admin-select"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-400">
            {filtered.length} month{filtered.length !== 1 ? 's' : ''} in range
          </span>
        </div>
      </section>

      {/* Summary cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="admin-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="admin-kpi-label">Total Revenue</div>
              <div className="admin-kpi-value">
                {loading ? '...' : money(summary.total)}
              </div>
              <div className="mt-1 text-xs text-slate-500">in selected range</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 shadow-sm">
              <Wallet className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="admin-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="admin-kpi-label">Avg Monthly Revenue</div>
              <div className="admin-kpi-value">
                {loading ? '...' : money(summary.avg)}
              </div>
              <div className="mt-1 text-xs text-slate-500">per month</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 shadow-sm">
              <BarChart2 className="h-5 w-5 text-indigo-600" />
            </div>
          </div>
        </div>

        <div className="admin-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="admin-kpi-label">Best Month</div>
              <div className="admin-kpi-value">
                {loading
                  ? '...'
                  : summary.best
                  ? monthLabel(summary.best.year, summary.best.month)
                  : '—'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {summary.best ? money(summary.best.collected) : ''}
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
          </div>
        </div>
      </section>

      {/* Bar chart */}
      {!loading && rows.length > 0 && (
        <section className="admin-card p-5">
          <div className="admin-card-title mb-4">Monthly Collections</div>
          <div className="flex h-44 items-end gap-1.5 overflow-x-auto pb-1">
            {[...rows]
              .sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))
              .map((row) => {
                const pct = maxCollected > 0 ? (row.collected / maxCollected) * 100 : 0;
                return (
                  <div
                    key={`${row.year}-${row.month}`}
                    className="group relative flex min-w-[32px] flex-1 flex-col items-center justify-end"
                  >
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-xs shadow-lg group-hover:block">
                      <div className="font-semibold text-slate-800">
                        {monthLabel(row.year, row.month)}
                      </div>
                      <div className="text-emerald-700">{money(row.collected)}</div>
                    </div>
                    {/* Bar */}
                    <div
                      className="w-full rounded-t-md bg-blue-500 transition-all duration-300 hover:bg-blue-400"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                    {/* Label */}
                    <div className="mt-1 w-full truncate text-center text-[10px] text-slate-500">
                      {padMonth(row.month)}/{String(row.year).slice(2)}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Revenue data table */}
      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title">Revenue Breakdown</div>
          <span className="admin-badge">{rows.length} months</span>
        </div>
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>
                  <button
                    onClick={() => toggleSort('month')}
                    className="flex items-center whitespace-nowrap"
                  >
                    Month <SortIcon field="month" />
                  </button>
                </th>
                <th>
                  <button
                    onClick={() => toggleSort('invoiced')}
                    className="flex items-center whitespace-nowrap"
                  >
                    Invoiced <SortIcon field="invoiced" />
                  </button>
                </th>
                <th>
                  <button
                    onClick={() => toggleSort('collected')}
                    className="flex items-center whitespace-nowrap"
                  >
                    Collected <SortIcon field="collected" />
                  </button>
                </th>
                <th>
                  <button
                    onClick={() => toggleSort('outstanding')}
                    className="flex items-center whitespace-nowrap"
                  >
                    Outstanding <SortIcon field="outstanding" />
                  </button>
                </th>
                <th>Collection Rate</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    Loading revenue data...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    No revenue data in the selected range.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const rate =
                    row.invoiced > 0
                      ? Math.round((row.collected / row.invoiced) * 100)
                      : 100;
                  return (
                    <tr key={`${row.year}-${row.month}`}>
                      <td>
                        <span className="font-medium text-slate-800">
                          {monthLabel(row.year, row.month)}
                        </span>
                      </td>
                      <td>{money(row.invoiced)}</td>
                      <td>
                        <span className="font-semibold text-emerald-700">
                          {money(row.collected)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            row.outstanding > 0 ? 'font-medium text-red-600' : 'text-slate-500'
                          }
                        >
                          {money(row.outstanding)}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${
                                rate >= 90
                                  ? 'bg-emerald-500'
                                  : rate >= 70
                                  ? 'bg-amber-400'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.min(rate, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-slate-700">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
