'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  FileText,
  Hash,
  Inbox,
  MessageSquare,
  Package,
  Receipt,
  RefreshCw,
  Send,
  Users,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CycleStatus = 'OPEN' | 'IMPORTED' | 'LOCKED' | 'INVOICED' | 'CLOSED';

type BillingCycle = {
  id: string;
  year: number;
  month: number;
  status: CycleStatus;
  building?: { name: string } | null;
  importBatchId?: string | null;
  totalRecords?: number;
  totalAmount?: number;
  invoicesIssued?: number;
  paymentsReceived?: number;
};

type BillingItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

type BillingRecord = {
  id: string;
  roomNumber?: string;
  room?: { roomNumber: string } | null;
  tenantName?: string;
  tenant?: { name: string } | null;
  totalAmount: number;
  status: string;
  items?: BillingItem[];
  _expanded?: boolean;
};

type InvoiceStatus = 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';

type Invoice = {
  id: string;
  roomNumber?: string;
  room?: { roomNumber: string } | null;
  tenantName?: string;
  tenant?: { name: string } | null;
  totalAmount: number;
  status: InvoiceStatus;
  sentAt?: string | null;
  dueDate?: string | null;
};

type ImportBatch = {
  id: string;
  sourceFilename?: string;
  importedAt?: string;
  createdAt?: string;
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  warningRows?: number;
  rows?: ImportRow[];
};

type ImportRow = {
  id: string;
  rowNo?: number;
  roomNumber?: string;
  validationStatus?: string;
  validationErrors?: Array<{ message?: string }>;
};

type ActiveTab = 'records' | 'invoices' | 'batch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function thaiMonthYear(year: number, month: number): string {
  return `${THAI_MONTHS[(month - 1) % 12]} ${year + 543}`;
}

function money(amount: number | null | undefined): string {
  if (amount == null) return '฿0';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cycleBadgeClass(status: CycleStatus): string {
  switch (status) {
    case 'CLOSED': return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'IMPORTED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'LOCKED': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'INVOICED': return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'OPEN': return 'bg-amber-100 text-amber-700 border-amber-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function invoiceBadgeClass(status: InvoiceStatus): string {
  switch (status) {
    case 'PAID': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'SENT': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'OVERDUE': return 'bg-red-100 text-red-700 border-red-200';
    case 'DRAFT': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'CANCELLED': return 'bg-slate-100 text-slate-500 border-slate-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function recordStatusBadgeClass(status: string): string {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED': return 'bg-emerald-100 text-emerald-700';
    case 'DRAFT': return 'bg-amber-100 text-amber-700';
    case 'VOID': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getRoomNumber(r: { roomNumber?: string; room?: { roomNumber: string } | null }): string {
  return r.roomNumber ?? r.room?.roomNumber ?? '-';
}

function getTenantName(r: { tenantName?: string; tenant?: { name: string } | null }): string {
  return r.tenantName ?? r.tenant?.name ?? 'No tenant';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-700'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: React.ReactNode;
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
// Records Tab
// ---------------------------------------------------------------------------

function RecordsTab({ cycleId }: { cycleId: string }) {
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/billing?billingCycleId=${cycleId}&pageSize=100`, {
          cache: 'no-store',
        }).then((r) => r.json());
        if (res.success && res.data) {
          const raw = res.data?.data ?? res.data ?? [];
          const list: BillingRecord[] = Array.isArray(raw) ? raw : [];
          setRecords(list);
          setLoading(false);
          return;
        }
      } catch {
        // fall through to error state
      }
      setError('Unable to load billing records.');
      setLoading(false);
    })();
  }, [cycleId]);

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">Loading billing records...</div>
    );
  }

  if (error) {
    return <div className="auth-alert auth-alert-error">{error}</div>;
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Inbox className="h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-500">No billing records for this cycle.</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="admin-table">
        <thead>
          <tr>
            <th />
            <th>Room</th>
            <th>Tenant</th>
            <th>Items Summary</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => {
            const isOpen = expanded.has(rec.id);
            const items = rec.items ?? [];
            const itemSummary =
              items.length > 0
                ? items.map((it) => it.description).join(', ')
                : `${items.length} items`;
            return (
              <>
                <tr key={rec.id} className="cursor-pointer hover:bg-slate-50" onClick={() => toggleRow(rec.id)}>
                  <td className="w-8 text-center">
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate-400 inline" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400 inline" />
                    )}
                  </td>
                  <td>
                    <span className="font-semibold text-slate-800">{getRoomNumber(rec)}</span>
                  </td>
                  <td className="text-slate-600">{getTenantName(rec)}</td>
                  <td className="max-w-[240px] truncate text-slate-500 text-sm">
                    {items.length === 0 ? (
                      <span className="text-slate-400 italic">No items</span>
                    ) : (
                      itemSummary
                    )}
                  </td>
                  <td className="font-semibold text-slate-800 tabular-nums">
                    {money(rec.totalAmount)}
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${recordStatusBadgeClass(rec.status)}`}
                    >
                      {rec.status ?? 'DRAFT'}
                    </span>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${rec.id}-expand`} className="bg-slate-50/70">
                    <td colSpan={6} className="px-4 pb-4 pt-2">
                      {items.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">No billing items available.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              <th className="pb-1 text-left">Description</th>
                              <th className="pb-1 text-right">Qty</th>
                              <th className="pb-1 text-right">Unit Price</th>
                              <th className="pb-1 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it) => (
                              <tr key={it.id} className="border-b border-slate-100 last:border-0">
                                <td className="py-1.5 text-slate-700">{it.description}</td>
                                <td className="py-1.5 text-right tabular-nums text-slate-600">
                                  {it.quantity}
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-slate-600">
                                  {money(it.unitPrice)}
                                </td>
                                <td className="py-1.5 text-right tabular-nums font-semibold text-slate-800">
                                  {money(it.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoices Tab
// ---------------------------------------------------------------------------

function InvoicesTab({ cycleId }: { cycleId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices?billingCycleId=${cycleId}&pageSize=100`, {
        cache: 'no-store',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to load invoices');
      setInvoices(res.data?.data ?? res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load invoices');
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendInvoice(invoiceId: string) {
    setSending(invoiceId);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to send invoice');
      setMessage('Invoice sent via LINE.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send invoice');
    } finally {
      setSending(null);
    }
  }

  async function sendAllUnsent() {
    const unsent = invoices.filter((inv) => inv.status === 'DRAFT' || inv.status === 'GENERATED');
    if (unsent.length === 0) return;
    setSendingAll(true);
    setMessage(null);
    setError(null);
    let sent = 0;
    for (const inv of unsent) {
      try {
        const res = await fetch(`/api/invoices/${inv.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).then((r) => r.json());
        if (res.success) sent++;
      } catch {
        // continue with next
      }
    }
    setMessage(`Sent ${sent} of ${unsent.length} unsent invoices.`);
    setSendingAll(false);
    await load();
  }

  const unsentCount = invoices.filter((inv) => inv.status === 'DRAFT' || inv.status === 'GENERATED').length;

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading invoices...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <div className="auth-alert auth-alert-success">{message}</div>}
      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Bulk action bar */}
      {unsentCount > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm text-amber-800">
            <span className="font-semibold">{unsentCount}</span> unsent invoice
            {unsentCount !== 1 ? 's' : ''} ready to send via LINE.
          </span>
          <button
            onClick={() => void sendAllUnsent()}
            disabled={sendingAll}
            className="admin-button admin-button-primary flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            {sendingAll ? 'Sending...' : 'Send All Unsent'}
          </button>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileText className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">No invoices for this billing cycle.</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Room</th>
                <th>Tenant</th>
                <th>Amount</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Sent At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <span className="font-mono text-xs text-slate-500" title={inv.id}>
                      {inv.id.slice(0, 8)}…
                    </span>
                  </td>
                  <td className="font-semibold text-slate-800">{getRoomNumber(inv)}</td>
                  <td className="text-slate-600">{getTenantName(inv)}</td>
                  <td className="tabular-nums font-semibold text-slate-800">
                    {money(inv.totalAmount)}
                  </td>
                  <td className="text-slate-600">{fmtDate(inv.dueDate)}</td>
                  <td>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${invoiceBadgeClass(inv.status)}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="text-slate-500 text-sm">{fmtDateTime(inv.sentAt)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {(inv.status === 'DRAFT' || inv.status === 'GENERATED' || inv.status === 'VIEWED') && (
                        <button
                          onClick={() => void sendInvoice(inv.id)}
                          disabled={sending === inv.id}
                          className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {sending === inv.id ? '...' : 'LINE'}
                        </button>
                      )}
                      <Link
                        href={`/api/invoices/${inv.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        PDF
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Batch Tab
// ---------------------------------------------------------------------------

function BatchTab({ batchId }: { batchId: string }) {
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/billing/import/batches/${batchId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setBatch(res.data as ImportBatch);
        } else {
          throw new Error(res.error?.message || 'Unable to load import batch');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load import batch');
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading import batch...</div>;
  }

  if (error) {
    return <div className="auth-alert auth-alert-error">{error}</div>;
  }

  if (!batch) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Package className="h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-500">Import batch not found.</p>
      </div>
    );
  }

  const rows = batch.rows ?? [];
  const filename = batch.sourceFilename ?? 'Unknown file';
  const importedAt = batch.importedAt ?? batch.createdAt;
  const totalRows = batch.totalRows ?? rows.length;
  const validRows = batch.validRows ?? rows.filter((r) => r.validationStatus === 'VALID').length;
  const invalidRows = batch.invalidRows ?? rows.filter((r) => r.validationStatus === 'ERROR').length;

  return (
    <div className="flex flex-col gap-4">
      {/* Batch info card */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Filename</div>
          <div className="mt-1 text-sm font-medium text-slate-800 break-all">{filename}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Imported At</div>
          <div className="mt-1 text-sm font-medium text-slate-800">{fmtDateTime(importedAt)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Rows</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{totalRows}</div>
        </div>
        <div className="flex gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Valid</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">{validRows}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-red-500">Invalid</div>
            <div className="mt-1 text-2xl font-bold text-red-600 tabular-nums">{invalidRows}</div>
          </div>
        </div>
      </div>

      {/* Rows table */}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No row details available.</p>
      ) : (
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Room</th>
                <th>Validation</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const firstError = row.validationErrors?.[0]?.message ?? null;
                const isValid = row.validationStatus !== 'ERROR';
                return (
                  <tr key={row.id}>
                    <td className="tabular-nums text-slate-500">{row.rowNo ?? idx + 1}</td>
                    <td className="font-semibold text-slate-800">{row.roomNumber ?? '-'}</td>
                    <td>
                      {isValid ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          Valid
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
                          <XCircle className="h-4 w-4" />
                          Invalid
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-red-600">
                      {firstError ? firstError : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BillingCycleDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const billingId = params?.billingId as string;

  // Support deep-linking to a specific tab via ?tab=invoices|records|batch
  const initialTab = ((): ActiveTab => {
    const t = searchParams?.get('tab');
    if (t === 'invoices' || t === 'records' || t === 'batch') return t;
    return 'records';
  })();

  const [cycle, setCycle] = useState<BillingCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);

  const load = useCallback(async () => {
    if (!billingId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    // Try the canonical cycle endpoint first, then fall back to a billing record lookup.
    const endpoints = [
      `/api/billing-cycles/${billingId}`,
      `/api/billing/${billingId}`,
    ];

    for (const url of endpoints) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.status === 404) continue;
        const res = await r.json();
        if (res.success && res.data) {
          setCycle(res.data as BillingCycle);
          setLoading(false);
          return;
        }
      } catch {
        // try next
      }
    }

    setNotFound(true);
    setLoading(false);
  }, [billingId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Loading state
  if (loading) {
    return (
      <main className="admin-page">
        <div className="py-16 text-center text-sm text-slate-500">Loading billing cycle...</div>
      </main>
    );
  }

  // Not found fallback
  if (notFound || (!loading && !cycle)) {
    return (
      <main className="admin-page">
        <nav className="flex items-center gap-1.5 text-sm text-slate-500">
          <Link href="/admin/billing" className="hover:text-indigo-600 transition-colors">
            Billing
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium text-slate-700">Not Found</span>
        </nav>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white py-20 text-center shadow-sm">
          <AlertTriangle className="h-12 w-12 text-amber-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Billing Cycle Not Found</h2>
            <p className="mt-1 text-sm text-slate-500">
              The billing cycle or invoice with ID <code className="font-mono text-xs">{billingId}</code> could not be found.
            </p>
          </div>
          <Link href="/admin/billing" className="admin-button admin-button-primary mt-2 flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Billing
          </Link>
        </div>
      </main>
    );
  }

  const cycleLabel = cycle
    ? thaiMonthYear(cycle.year, cycle.month)
    : 'Billing Cycle';

  const building = cycle?.building?.name ?? 'Main Building';
  const batchId = cycle?.importBatchId;

  return (
    <main className="admin-page">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/admin/billing" className="hover:text-indigo-600 transition-colors">
          Billing
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-slate-700">{cycleLabel}</span>
      </nav>

      {/* Page header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/billing"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="admin-page-title">{cycleLabel}</h1>
              {cycle?.status && (
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${cycleBadgeClass(cycle.status as CycleStatus)}`}
                >
                  {cycle.status}
                </span>
              )}
            </div>
            <p className="admin-page-subtitle">
              {building}
              {batchId && (
                <span className="ml-2 font-mono text-xs text-slate-400">
                  Batch: {batchId.slice(0, 8)}…
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="admin-toolbar">
          <button
            onClick={() => void load()}
            className="admin-button flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </section>

      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Stats row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Records"
          value={cycle?.totalRecords ?? '—'}
          icon={<Hash className="h-5 w-5" />}
          iconBg="border-indigo-200 bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <StatCard
          label="Total Amount"
          value={money(cycle?.totalAmount)}
          icon={<Receipt className="h-5 w-5" />}
          iconBg="border-emerald-200 bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="Invoices Issued"
          value={cycle?.invoicesIssued ?? '—'}
          icon={<FileText className="h-5 w-5" />}
          iconBg="border-blue-200 bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="Payments Received"
          value={cycle?.paymentsReceived ?? '—'}
          icon={<Users className="h-5 w-5" />}
          iconBg="border-violet-200 bg-violet-50"
          iconColor="text-violet-600"
        />
      </section>

      {/* Tabs + content */}
      <section className="admin-card overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200 px-4">
          <TabButton active={activeTab === 'records'} onClick={() => setActiveTab('records')}>
            <Hash className="h-4 w-4" />
            Records
          </TabButton>
          <TabButton active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')}>
            <FileText className="h-4 w-4" />
            Invoices
          </TabButton>
          <TabButton
            active={activeTab === 'batch'}
            onClick={() => setActiveTab('batch')}
          >
            <Package className="h-4 w-4" />
            Import Batch
          </TabButton>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === 'records' && <RecordsTab cycleId={billingId} />}
          {activeTab === 'invoices' && <InvoicesTab cycleId={billingId} />}
          {activeTab === 'batch' && (
            batchId ? (
              <BatchTab batchId={batchId} />
            ) : (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Package className="h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-500">No import batch linked to this billing cycle.</p>
              </div>
            )
          )}
        </div>
      </section>
    </main>
  );
}
