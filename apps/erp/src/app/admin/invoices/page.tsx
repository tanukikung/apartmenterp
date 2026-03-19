'use client';

/**
 * /admin/invoices — Cross-cycle Invoice Monitoring
 *
 * READ-HEAVY monitoring view of Invoice lifecycle records.
 * - Shows invoice status across all billing cycles
 * - Status filter tabs (ALL / GENERATED / SENT / VIEWED / PAID / OVERDUE)
 * - Search by room number, tenant name, or invoice number
 * - KPI row: count per non-terminal status
 * - Row actions:
 *     - PDF link         (always available after GENERATED)
 *     - Send             (GENERATED / SENT / VIEWED only — reuses POST /api/invoices/[id]/send)
 *     - View Billing     (links to billing cycle detail → Invoices tab)
 *
 * NOT included here (belongs in /admin/billing/[id]):
 *     - Generate invoice from billing record
 *     - Import / lock billing cycle
 *     - Bulk cycle-level transitions
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Inbox,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceStatus = 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE';
type StatusFilter = 'ALL' | InvoiceStatus;

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  roomId: string;
  billingRecordId: string;
  billingCycleId?: string | null;
  year: number;
  month: number;
  status: InvoiceStatus;
  totalAmount: number;
  dueDate: string;
  sentAt?: string | null;
  paidAt?: string | null;
  room?: { roomNumber: string } | null;
  tenantName?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const STATUS_META: Record<InvoiceStatus, { label: string; cls: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'bg-slate-100  text-slate-600  border-slate-200'  },
  GENERATED: { label: 'Generated', cls: 'bg-sky-100    text-sky-700    border-sky-200'    },
  SENT:      { label: 'Sent',      cls: 'bg-blue-100   text-blue-700   border-blue-200'   },
  VIEWED:    { label: 'Viewed',    cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  PAID:      { label: 'Paid',      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  OVERDUE:   { label: 'Overdue',   cls: 'bg-red-100    text-red-700    border-red-200'    },
};

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL',       label: 'All'       },
  { value: 'GENERATED', label: 'Generated' },
  { value: 'SENT',      label: 'Sent'      },
  { value: 'VIEWED',    label: 'Viewed'    },
  { value: 'PAID',      label: 'Paid'      },
  { value: 'OVERDUE',   label: 'Overdue'   },
];

/** Statuses where sending via LINE is allowed.
 *  SENT is excluded — the API returns 400 "Invoice already sent" for SENT invoices.
 *  VIEWED is included because the tenant opened the link but hasn't paid yet. */
const SENDABLE: InvoiceStatus[] = ['GENERATED', 'VIEWED'];

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

function fmtPeriod(year: number, month: number): string {
  return `${THAI_MONTHS[month - 1] ?? month} ${year + 543}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function roomNum(inv: InvoiceRow): string {
  return inv.room?.roomNumber ?? '—';
}

function billingCycleLink(inv: InvoiceRow): string {
  if (inv.billingCycleId) {
    return `/admin/billing/${inv.billingCycleId}?tab=invoices`;
  }
  // Fallback: billing list filtered by period
  return `/admin/billing?year=${inv.year}&month=${inv.month}`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  // Pagination
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // ---------------------------------------------------------------------------
  // Data load — fetches from GET /api/invoices (the canonical invoice endpoint)
  // ---------------------------------------------------------------------------
  const load = useCallback(async (pg = 1, status: StatusFilter = 'ALL') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(pg),
        pageSize: String(PAGE_SIZE),
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      if (status !== 'ALL') params.set('status', status);

      const res = await fetch(`/api/invoices?${params.toString()}`, {
        cache: 'no-store',
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.error?.message ?? 'Failed to load invoices');

      const payload = res.data as {
        data: InvoiceRow[];
        total: number;
        page: number;
        totalPages: number;
      };
      setInvoices(payload.data ?? []);
      setTotal(payload.total ?? 0);
      setPage(pg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, statusFilter);
  }, [load, statusFilter]);

  // ---------------------------------------------------------------------------
  // Send — reuses POST /api/invoices/[id]/send (same endpoint as billing detail)
  // ---------------------------------------------------------------------------
  async function sendInvoice(id: string) {
    setSending(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'LINE' }),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.error?.message ?? 'Send failed');

      setMessage(`Invoice queued for LINE delivery`);
      // Refresh current page to reflect status change
      void load(page, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Client-side search (runs on already-fetched page)
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        roomNum(inv).toLowerCase().includes(q) ||
        (inv.tenantName ?? '').toLowerCase().includes(q) ||
        inv.invoiceNumber.toLowerCase().includes(q),
    );
  }, [invoices, search]);

  // ---------------------------------------------------------------------------
  // KPIs — computed from the FULL loaded page (not just filtered rows)
  // ---------------------------------------------------------------------------
  const kpi = useMemo(() => {
    const counts: Partial<Record<InvoiceStatus, number>> = {};
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] ?? 0) + 1;
    }
    return counts;
  }, [invoices]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="admin-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Invoices</h1>
          <p className="admin-page-subtitle">
            Cross-cycle invoice status monitoring. To generate or bulk-send, open a{' '}
            <Link href="/admin/billing" className="text-indigo-600 hover:underline">
              Billing Cycle
            </Link>
            .
          </p>
        </div>
        <div className="admin-toolbar">
          <button
            onClick={() => void load(page, statusFilter)}
            disabled={loading}
            className="admin-button flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {message && (
        <div className="auth-alert auth-alert-success">{message}</div>
      )}
      {error && (
        <div className="auth-alert auth-alert-error">{error}</div>
      )}

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Generated"
          value={kpi.GENERATED ?? 0}
          icon={<FileText className="h-5 w-5 text-sky-600" />}
          iconBg="bg-sky-50 border-sky-200"
        />
        <KpiCard
          label="Sent / Viewed"
          value={(kpi.SENT ?? 0) + (kpi.VIEWED ?? 0)}
          icon={<Send className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50 border-blue-200"
        />
        <KpiCard
          label="Paid"
          value={kpi.PAID ?? 0}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50 border-emerald-200"
        />
        <KpiCard
          label="Overdue"
          value={kpi.OVERDUE ?? 0}
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          iconBg="bg-red-50 border-red-200"
        />
      </section>

      {/* ── Status tabs + Search ────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-3">
        {/* Status tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setSearch('');
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Room #, tenant, invoice #..."
            className="admin-input w-full pl-9"
          />
        </div>

        {/* Record count */}
        <span className="text-sm text-slate-500">
          {filtered.length} of {total} invoices
        </span>
      </section>

      {/* ── Invoice table ──────────────────────────────────────────────────── */}
      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title">Invoice Records</div>
          {statusFilter !== 'ALL' && (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[statusFilter as InvoiceStatus]?.cls ?? ''}`}>
              {STATUS_META[statusFilter as InvoiceStatus]?.label ?? statusFilter}
            </span>
          )}
        </div>

        {/* Empty state */}
        {!loading && invoices.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Inbox className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-base font-semibold text-slate-700">No invoices found</p>
            <p className="text-sm text-slate-400">
              {statusFilter !== 'ALL'
                ? `No ${statusFilter.toLowerCase()} invoices. Try a different filter.`
                : 'No invoices have been generated yet. Open a billing cycle to get started.'}
            </p>
            <Link href="/admin/billing" className="admin-button admin-button-primary mt-1 flex items-center gap-2">
              Go to Billing Cycles
            </Link>
          </div>
        )}

        {(loading || invoices.length > 0) && (
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Room</th>
                  <th>Tenant</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th className="text-right">Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                      <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-300" />
                      Loading invoices...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                      No invoices match your search.
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const meta = STATUS_META[inv.status];
                    const canSend = SENDABLE.includes(inv.status);
                    const isSending = sending === inv.id;

                    return (
                      <tr key={inv.id}>
                        {/* Invoice number */}
                        <td>
                          <span className="font-mono text-xs font-medium text-slate-700">
                            {inv.invoiceNumber}
                          </span>
                        </td>

                        {/* Room */}
                        <td>
                          <span className="font-semibold text-slate-800">{roomNum(inv)}</span>
                        </td>

                        {/* Tenant */}
                        <td>
                          <span className="text-slate-600">{inv.tenantName ?? '—'}</span>
                        </td>

                        {/* Period */}
                        <td>
                          <span className="text-slate-600">{fmtPeriod(inv.year, inv.month)}</span>
                        </td>

                        {/* Status */}
                        <td>
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta?.cls ?? 'bg-slate-100 text-slate-600'}`}
                          >
                            {meta?.label ?? inv.status}
                          </span>
                          {inv.sentAt && (
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400">
                              <Clock className="h-2.5 w-2.5" />
                              {fmtDate(inv.sentAt)}
                            </div>
                          )}
                        </td>

                        {/* Due date */}
                        <td>
                          <span
                            className={
                              inv.status === 'OVERDUE'
                                ? 'font-semibold text-red-600'
                                : 'text-slate-600'
                            }
                          >
                            {fmtDate(inv.dueDate)}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="text-right">
                          <span
                            className={`tabular-nums font-semibold ${
                              inv.status === 'PAID'
                                ? 'text-emerald-700'
                                : inv.status === 'OVERDUE'
                                  ? 'text-red-700'
                                  : 'text-slate-800'
                            }`}
                          >
                            {money(inv.totalAmount)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="flex items-center gap-1.5">
                            {/* PDF — available once Generated+ */}
                            {inv.status !== 'DRAFT' && (
                              <a
                                href={`/api/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="admin-button flex items-center gap-1 text-xs"
                                title="Download PDF"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                PDF
                              </a>
                            )}

                            {/* Send — reuses POST /api/invoices/[id]/send */}
                            {canSend && (
                              <button
                                onClick={() => void sendInvoice(inv.id)}
                                disabled={isSending || sending !== null}
                                className="admin-button flex items-center gap-1 text-xs"
                                title="Send via LINE"
                              >
                                <Send className="h-3.5 w-3.5" />
                                {isSending ? 'Sending…' : 'Send'}
                              </button>
                            )}

                            {/* View billing cycle — most specific route available */}
                            <Link
                              href={billingCycleLink(inv)}
                              className="admin-button flex items-center gap-1 text-xs"
                              title="Open billing cycle detail"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Billing
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void load(page - 1, statusFilter)}
                disabled={page <= 1 || loading}
                className="admin-button text-xs disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => void load(page + 1, statusFilter)}
                disabled={page >= totalPages || loading}
                className="admin-button text-xs disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// KPI card sub-component
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  icon,
  iconBg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconBg}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      </div>
    </div>
  );
}
