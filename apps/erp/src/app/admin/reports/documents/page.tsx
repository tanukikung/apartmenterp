'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, Download, FileText, Filter } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  dueDate: string;
  createdAt: string;
  room?: { roomNumber?: string } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusBadgeClass(status: string): string {
  switch (status.toUpperCase()) {
    case 'PAID':
      return 'inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700';
    case 'UNPAID':
    case 'PENDING':
      return 'inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700';
    case 'OVERDUE':
      return 'inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700';
    case 'CANCELLED':
    case 'VOID':
      return 'inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500';
    default:
      return 'inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600';
  }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// KPI skeleton
// ---------------------------------------------------------------------------

function KpiSkeleton() {
  return (
    <div className="admin-kpi animate-pulse">
      <div className="mb-2 h-3 w-24 rounded bg-slate-100" />
      <div className="h-8 w-16 rounded bg-slate-100" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function DocumentActivityPage() {
  const now = new Date();
  const currentYear = now.getFullYear();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(0); // 0 = all months

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pageSize: '50', page: '1' });
      if (selectedMonth > 0) {
        params.set('month', String(selectedMonth));
      }
      const res = await fetch(`/api/invoices?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { data?: Invoice[]; total?: number } | Invoice[];
        error?: { message?: string };
      };
      if (!json.success) {
        throw new Error(json.error?.message ?? 'Unable to load document activity');
      }
      const payload = json.data;
      if (Array.isArray(payload)) {
        setInvoices(payload);
      } else if (payload && Array.isArray((payload as { data?: Invoice[] }).data)) {
        setInvoices((payload as { data: Invoice[] }).data);
      } else {
        setInvoices([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load document activity');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Derived KPI values
  // ---------------------------------------------------------------------------

  const totalDocuments = invoices.length;

  const invoicesGenerated = invoices.filter(
    (inv) => inv.invoiceNumber && inv.invoiceNumber.trim() !== ''
  ).length;

  const contractsCreated = 0; // Contracts not in invoice data; placeholder

  const pendingDelivery = invoices.filter((inv) => {
    const s = inv.status.toUpperCase();
    return s === 'UNPAID' || s === 'PENDING';
  }).length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
            <h1 className="admin-page-title">Document Activity</h1>
            <p className="admin-page-subtitle">
              Invoice and document generation history, download counts, and delivery status.
            </p>
          </div>
        </div>
        <button onClick={() => void load()} className="admin-button" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </section>

      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Month filter */}
      <section className="admin-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <Filter className="h-4 w-4 text-slate-400" />
            Filter by Month:
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400" />
            <select
              className="admin-input w-auto"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
            >
              <option value={0}>All Months — {currentYear}</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name} {currentYear}
                </option>
              ))}
            </select>
          </div>
          {selectedMonth > 0 && (
            <button
              onClick={() => setSelectedMonth(0)}
              className="admin-button text-xs"
            >
              Clear Filter
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {loading ? 'Loading...' : `${totalDocuments} document${totalDocuments !== 1 ? 's' : ''} found`}
          </span>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </>
        ) : (
          <>
            <div className="admin-kpi">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="admin-kpi-label">Total Documents</div>
                  <div className="admin-kpi-value">{totalDocuments}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {selectedMonth > 0 ? MONTH_NAMES[selectedMonth - 1] : 'All time'}
                  </div>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
                  <FileText className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </div>

            <div className="admin-kpi">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="admin-kpi-label">Invoices Generated</div>
                  <div className="admin-kpi-value">{invoicesGenerated}</div>
                  <div className="mt-1 text-xs text-slate-500">with invoice number</div>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 shadow-sm">
                  <Download className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="admin-kpi">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="admin-kpi-label">Contracts Created</div>
                  <div className="admin-kpi-value">{contractsCreated}</div>
                  <div className="mt-1 text-xs text-slate-500">rental agreements</div>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-200 bg-indigo-50 shadow-sm">
                  <FileText className="h-5 w-5 text-indigo-600" />
                </div>
              </div>
            </div>

            <div className="admin-kpi">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="admin-kpi-label">Pending Delivery</div>
                  <div className="admin-kpi-value text-amber-700">{pendingDelivery}</div>
                  <div className="mt-1 text-xs text-slate-500">unpaid / pending</div>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
                  <Calendar className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Document activity table */}
      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <div className="admin-card-title">Recent Document Activity</div>
          </div>
          <span className="admin-badge">{loading ? '...' : totalDocuments}</span>
        </div>

        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Document #</th>
                <th>Type</th>
                <th>Room</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Skeleton rows
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td>
                      <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td>
                      <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td>
                      <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td>
                      <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td>
                      <div className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
                    </td>
                    <td>
                      <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                    </td>
                    <td>
                      <div className="h-4 w-10 animate-pulse rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No document activity found
                    {selectedMonth > 0
                      ? ` for ${MONTH_NAMES[selectedMonth - 1]} ${currentYear}.`
                      : '.'}
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <span className="font-mono text-sm font-medium text-slate-800">
                        {invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`}
                      </span>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        Invoice
                      </span>
                    </td>
                    <td className="text-sm text-slate-600">
                      {invoice.room?.roomNumber ?? '—'}
                    </td>
                    <td className="text-sm font-medium text-slate-800">
                      {money(invoice.totalAmount)}
                    </td>
                    <td>
                      <span className={statusBadgeClass(invoice.status)}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="text-sm text-slate-500">
                      {formatDate(invoice.createdAt)}
                    </td>
                    <td>
                      <Link
                        href="/admin/documents"
                        className="text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
