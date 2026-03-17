'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Info,
  Layers,
  Loader2,
  RefreshCw,
  ReceiptText,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types — aligned to GET /api/billing-cycles response
// ---------------------------------------------------------------------------

type CycleStatus = 'OPEN' | 'IMPORTED' | 'LOCKED' | 'INVOICED' | 'CLOSED';

interface BillingCycle {
  id: string;
  year: number;
  month: number;
  status: CycleStatus;
  building: { id: string; name: string } | null;
  totalRecords: number;
  totalAmount: number;
  invoiceCount: number;
  pendingInvoices: number;
  billingDate: string | null;
  dueDate: string | null;
  createdAt: string;
}

interface KpiData {
  openCycles: number;
  totalBilledThisMonth: number;
  totalRecords: number;
  pendingInvoices: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const STATUS_BADGE: Record<CycleStatus, { cls: string; label: string }> = {
  OPEN:     { cls: 'bg-sky-100    text-sky-700    border-sky-200',    label: 'Open'     },
  IMPORTED: { cls: 'bg-blue-100   text-blue-700   border-blue-200',   label: 'Imported' },
  LOCKED:   { cls: 'bg-amber-100  text-amber-700  border-amber-200',  label: 'Locked'   },
  INVOICED: { cls: 'bg-green-100  text-green-700  border-green-200',  label: 'Invoiced' },
  CLOSED:   { cls: 'bg-gray-100   text-gray-500   border-gray-200',   label: 'Closed'   },
};

const STATUS_FILTER_OPTIONS: { value: CycleStatus | 'ALL'; label: string }[] = [
  { value: 'ALL',      label: 'All Statuses' },
  { value: 'OPEN',     label: 'Open'         },
  { value: 'IMPORTED', label: 'Imported'     },
  { value: 'LOCKED',   label: 'Locked'       },
  { value: 'INVOICED', label: 'Invoiced'     },
  { value: 'CLOSED',   label: 'Closed'       },
];

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [{ value: 'ALL', label: 'All Months' }];
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

function thaiMonthYear(year: number, month: number): string {
  const m = THAI_MONTHS[month - 1] ?? String(month);
  return `${m} ${year + 543}`;
}

function formatBaht(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function deriveKpis(cycles: BillingCycle[]): KpiData {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const openCycles = cycles.filter((c) => c.status === 'OPEN' || c.status === 'IMPORTED').length;
  const totalBilledThisMonth = cycles
    .filter((c) => c.year === thisYear && c.month === thisMonth)
    .reduce((s, c) => s + (c.totalAmount ?? 0), 0);
  const totalRecords = cycles.reduce((s, c) => s + (c.totalRecords ?? 0), 0);
  const pendingInvoices = cycles.reduce((s, c) => s + (c.pendingInvoices ?? 0), 0);
  return { openCycles, totalBilledThisMonth, totalRecords, pendingInvoices };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CycleStatus }) {
  const { cls, label } = STATUS_BADGE[status] ?? {
    cls: 'bg-gray-100 text-gray-600 border-gray-200',
    label: status,
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI card
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
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconBg} ${iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate invoices button state
// ---------------------------------------------------------------------------

type GeneratingMap = Record<string, 'idle' | 'loading' | 'done' | 'error'>;

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminBillingPage() {
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiAvailable, setApiAvailable] = useState(true);

  const [statusFilter, setStatusFilter] = useState<CycleStatus | 'ALL'>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');

  const [generating, setGenerating] = useState<GeneratingMap>({});
  const [generateErrors, setGenerateErrors] = useState<Record<string, string>>({});

  const monthOptions = getMonthOptions();
  const kpis = deriveKpis(cycles);

  // ---------------------------------------------------------------------------
  // Load cycles from the correct endpoint
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing-cycles?pageSize=50&sortBy=year&sortOrder=desc', {
        cache: 'no-store',
      });
      if (!res.ok) {
        setApiAvailable(false);
        setCycles([]);
        setLoading(false);
        return;
      }
      const json = await res.json();
      const list: BillingCycle[] = json.data?.data ?? [];
      setCycles(list);
      setApiAvailable(true);
    } catch {
      setCycles([]);
      setApiAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Generate invoices (lock record → generate invoice)
  // ---------------------------------------------------------------------------

  async function handleGenerateInvoices(cycleId: string) {
    setGenerating((prev) => ({ ...prev, [cycleId]: 'loading' }));
    setGenerateErrors((prev) => ({ ...prev, [cycleId]: '' }));
    try {
      // For billing CYCLES we use the cycle's billingRecords via the billing API.
      // POST to the generate endpoint for the cycle as a whole isn't implemented yet
      // — for now we navigate to the cycle detail where per-record generation is available.
      // If the cycle is in LOCKED state we could generate for all records, but that needs
      // a bulk generate endpoint. Until then, we redirect to the detail page.
      window.location.href = `/admin/billing/${cycleId}`;
    } catch (err) {
      setGenerating((prev) => ({ ...prev, [cycleId]: 'error' }));
      setGenerateErrors((prev) => ({
        ...prev,
        [cycleId]: err instanceof Error ? err.message : 'Failed',
      }));
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered list
  // ---------------------------------------------------------------------------

  const filtered = cycles.filter((c) => {
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchMonth =
      monthFilter === 'ALL' ||
      monthFilter === `${c.year}-${String(c.month).padStart(2, '0')}`;
    return matchStatus && matchMonth;
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Billing Cycles</h1>
          <p className="admin-page-subtitle">
            Monthly billing periods — import, review, lock, and generate invoices.
          </p>
        </div>
        <div className="admin-toolbar">
          <Link
            href="/admin/billing/import"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Link>
          <Link
            href="/admin/billing/batches"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <Layers className="h-4 w-4" />
            Import Batches
          </Link>
          <Link
            href="/admin/invoices"
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-colors hover:bg-indigo-100"
          >
            <ReceiptText className="h-4 w-4" />
            View Invoices
          </Link>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </section>

      {/* API unavailable notice */}
      {!loading && !apiAvailable && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Billing API not available.</span>{' '}
            Start by importing your first billing cycle via Excel.
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse flex items-start gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="h-11 w-11 rounded-2xl bg-slate-200" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 w-20 rounded bg-slate-200" />
                <div className="h-6 w-16 rounded bg-slate-200" />
              </div>
            </div>
          ))
        ) : (
          <>
            <KpiCard
              label="Active Cycles"
              value={kpis.openCycles}
              sub="Open + Imported"
              icon={<Zap className="h-5 w-5" />}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
            />
            <KpiCard
              label="Total Billed This Month"
              value={`฿${formatBaht(kpis.totalBilledThisMonth)}`}
              icon={<BarChart2 className="h-5 w-5" />}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
            />
            <KpiCard
              label="Total Records"
              value={kpis.totalRecords.toLocaleString()}
              sub="Billing records across all cycles"
              icon={<FileText className="h-5 w-5" />}
              iconBg="bg-indigo-100"
              iconColor="text-indigo-600"
            />
            <KpiCard
              label="Pending Invoices"
              value={kpis.pendingInvoices}
              sub="Not yet paid"
              icon={<ReceiptText className="h-5 w-5" />}
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CycleStatus | 'ALL')}
            className="appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        </div>

        <div className="relative">
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="appearance-none rounded-xl border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        </div>

        {(statusFilter !== 'ALL' || monthFilter !== 'ALL') && (
          <button
            onClick={() => { setStatusFilter('ALL'); setMonthFilter('ALL'); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FileSpreadsheet className="mb-3 h-12 w-12 text-slate-300" />
            {cycles.length === 0 ? (
              <>
                <p className="font-semibold text-slate-600">No billing cycles yet</p>
                <p className="mt-1 text-sm text-slate-400">Import your first billing cycle to get started.</p>
                <Link
                  href="/admin/billing/import"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Import your first billing cycle
                </Link>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-600">No cycles match your filters</p>
                <button
                  onClick={() => { setStatusFilter('ALL'); setMonthFilter('ALL'); }}
                  className="mt-3 text-sm text-indigo-600 hover:underline"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['Month / Year', 'Building', 'Status', 'Records', 'Total Amount', 'Invoices', 'Due Date', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((cycle) => {
                  const genState = generating[cycle.id] ?? 'idle';
                  const genError = generateErrors[cycle.id];
                  const canGenerate = cycle.status === 'LOCKED' || cycle.status === 'IMPORTED';
                  return (
                    <>
                      <tr key={cycle.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                          {thaiMonthYear(cycle.year, cycle.month)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {cycle.building?.name ?? <span className="italic text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={cycle.status} />
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {(cycle.totalRecords ?? 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap">
                          ฿{formatBaht(cycle.totalAmount ?? 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {cycle.invoiceCount > 0 ? (
                            <span>
                              {cycle.invoiceCount}
                              {cycle.pendingInvoices > 0 && (
                                <span className="ml-1.5 text-xs text-amber-600">
                                  ({cycle.pendingInvoices} pending)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="italic text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                          {cycle.dueDate
                            ? new Date(cycle.dueDate).toLocaleDateString('th-TH', {
                                day: '2-digit', month: 'short', year: 'numeric',
                              })
                            : <span className="italic text-slate-400">—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/billing/${cycle.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 whitespace-nowrap"
                            >
                              View Detail
                            </Link>
                            {canGenerate && (
                              <button
                                onClick={() => void handleGenerateInvoices(cycle.id)}
                                disabled={genState === 'loading'}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
                              >
                                {genState === 'loading' ? (
                                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Opening…</>
                                ) : genState === 'done' ? (
                                  <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Done</>
                                ) : (
                                  <><Zap className="h-3.5 w-3.5" /> Generate Invoices</>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {genState === 'error' && genError && (
                        <tr key={`${cycle.id}-err`} className="bg-red-50">
                          <td colSpan={8} className="px-4 py-2">
                            <div className="flex items-center gap-2 text-xs text-red-700">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                              {genError}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-right text-xs text-slate-400">
          Showing {filtered.length} of {cycles.length} billing cycle{cycles.length !== 1 ? 's' : ''}
        </p>
      )}
    </main>
  );
}
