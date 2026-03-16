'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink,
  FileCheck,
  FileClock,
  FileText,
  FileX,
  Receipt,
  ScrollText,
  Send,
} from 'lucide-react';

type Invoice = {
  id: string;
  invoiceNumber: string;
  year: number;
  month: number;
  version: number;
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE';
  totalAmount: number;
  dueDate: string;
  sentAt: string | null;
  paidAt: string | null;
  room?: { roomNumber: string } | null;
  contract?: {
    tenant?: {
      firstName: string;
      lastName: string;
    } | null;
  } | null;
  tenantName?: string;
  roomNumber?: string;
  lineUserId?: string | null;
  deliveries?: Array<{
    id: string;
    channel: string;
    status: string;
    recipientRef: string | null;
    sentAt: string | null;
    viewedAt: string | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
};

type TabType = 'all' | 'invoices' | 'receipts' | 'contracts';

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function tenantName(inv: Invoice): string {
  if (inv.tenantName) return inv.tenantName;
  const t = inv.contract?.tenant;
  if (t) return `${t.firstName} ${t.lastName}`.trim();
  return '—';
}

function roomNum(inv: Invoice): string {
  return inv.room?.roomNumber ?? inv.roomNumber ?? '—';
}

function docNumber(inv: Invoice): string {
  return inv.invoiceNumber ?? `INV-${inv.year}-${String(inv.month).padStart(2, '0')}-${inv.id.slice(0, 6).toUpperCase()}`;
}

function latestLineDelivery(inv: Invoice) {
  return inv.deliveries?.find((delivery) => delivery.channel === 'LINE') ?? null;
}

/** Classify document type based on invoice status. */
function docType(inv: Invoice): 'invoice' | 'receipt' | 'contract' {
  if (inv.status === 'PAID') return 'receipt';
  return 'invoice';
}

function DocTypeIcon({ type }: { type: ReturnType<typeof docType> }) {
  if (type === 'receipt') return <Receipt className="h-4 w-4 text-emerald-600" />;
  if (type === 'contract') return <ScrollText className="h-4 w-4 text-indigo-600" />;
  return <FileText className="h-4 w-4 text-blue-600" />;
}

function statusIcon(status: Invoice['status']) {
  if (status === 'PAID') return <FileCheck className="h-4 w-4 text-emerald-500" />;
  if (status === 'OVERDUE') return <FileX className="h-4 w-4 text-red-500" />;
  if (status === 'SENT' || status === 'VIEWED') return <FileClock className="h-4 w-4 text-amber-500" />;
  return <FileText className="h-4 w-4 text-slate-400" />;
}

function statusBadge(status: Invoice['status']): string {
  if (status === 'PAID') return 'admin-status-good';
  if (status === 'OVERDUE') return 'admin-status-bad';
  if (status === 'SENT' || status === 'VIEWED') return 'admin-status-warn';
  return '';
}

const TABS: { key: TabType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'receipts', label: 'Receipts' },
  { key: 'contracts', label: 'Contracts' },
];

export default function AdminDocumentsPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [tab, setTab] = useState<TabType>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices?pageSize=50', { cache: 'no-store' }).then((r) =>
        r.json()
      );
      if (!res.success) throw new Error(res.error?.message || 'Unable to load documents');
      const raw: Invoice[] = res.data?.data ?? res.data ?? [];
      setInvoices(raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = invoices;

    // Tab filter
    if (tab === 'invoices') rows = rows.filter((inv) => docType(inv) === 'invoice');
    else if (tab === 'receipts') rows = rows.filter((inv) => docType(inv) === 'receipt');
    else if (tab === 'contracts') rows = rows.filter((inv) => docType(inv) === 'contract');

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (inv) =>
          docNumber(inv).toLowerCase().includes(q) ||
          roomNum(inv).toLowerCase().includes(q) ||
          tenantName(inv).toLowerCase().includes(q)
      );
    }

    return rows;
  }, [invoices, tab, search]);

  // Tab counts
  const counts = useMemo(
    () => ({
      all: invoices.length,
      invoices: invoices.filter((inv) => docType(inv) === 'invoice').length,
      receipts: invoices.filter((inv) => docType(inv) === 'receipt').length,
      contracts: invoices.filter((inv) => docType(inv) === 'contract').length,
    }),
    [invoices]
  );

  async function sendDocument(id: string) {
    setWorking(`send:${id}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendToLine: true }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Failed to send document');
      setMessage('Document sent via LINE');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send document');
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Documents</h1>
          <p className="admin-page-subtitle">
            Invoices, receipts, and contracts — view PDFs and send via LINE
          </p>
        </div>
        <div className="admin-toolbar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search document #, room, tenant..."
            className="admin-input w-[240px]"
          />
          <button onClick={() => void load()} className="admin-button">
            Refresh
          </button>
        </div>
      </section>

      {message && <div className="auth-alert auth-alert-success">{message}</div>}
      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Filter tabs */}
      <section className="flex items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </section>

      {/* Document table */}
      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title">Document Library</div>
          <span className="admin-badge">{filtered.length} documents</span>
        </div>
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
                <tr>
                  <th>Type</th>
                  <th>Document #</th>
                  <th>Room</th>
                  <th>Tenant</th>
                  <th>LINE</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    Loading documents...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                    No documents found.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const type = docType(inv);
                  const dateStr = inv.paidAt ?? inv.sentAt ?? inv.dueDate;
                  const delivery = latestLineDelivery(inv);
                  return (
                    <tr key={inv.id}>
                      {/* Type icon */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          <DocTypeIcon type={type} />
                          <span className="hidden text-xs capitalize text-slate-600 sm:inline">
                            {type}
                          </span>
                        </div>
                      </td>

                      {/* Document number */}
                      <td>
                        <span className="font-mono text-sm font-medium text-slate-800">
                          {docNumber(inv)}
                        </span>
                        <div className="text-xs text-slate-500">
                          {inv.year}-{String(inv.month).padStart(2, '0')}
                        </div>
                      </td>

                      {/* Room */}
                      <td>
                        <span className="font-semibold text-slate-700">{roomNum(inv)}</span>
                      </td>

                      {/* Tenant */}
                      <td>{tenantName(inv)}</td>

                      {/* LINE */}
                      <td>
                        <div className="space-y-1">
                          <div>
                            {inv.lineUserId ? (
                              <span className="admin-badge admin-status-good">Linked</span>
                            ) : (
                              <span className="admin-badge">Not linked</span>
                            )}
                          </div>
                          {delivery ? (
                            <div className="text-xs text-slate-500">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 ${
                                  delivery.status === 'SENT' || delivery.status === 'VIEWED'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : delivery.status === 'FAILED'
                                    ? 'bg-red-100 text-red-600'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {delivery.status}
                              </span>
                              {delivery.errorMessage ? (
                                <div className="mt-1 max-w-[180px] truncate text-red-500" title={delivery.errorMessage}>
                                  {delivery.errorMessage}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-400">No delivery yet</div>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td>
                        <span className="text-sm text-slate-600">
                          {new Date(dateStr).toLocaleDateString('en-GB')}
                        </span>
                      </td>

                      {/* Amount */}
                      <td>
                        <span className="font-semibold text-slate-800">
                          {money(inv.totalAmount)}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <div className="flex items-center gap-1.5">
                          {statusIcon(inv.status)}
                          <span className={`admin-badge ${statusBadge(inv.status)}`}>
                            {inv.status}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="flex items-center gap-2">
                          <a
                            href={`/admin/documents/${inv.id}`}
                            className="admin-button flex items-center gap-1.5 text-xs"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Detail
                          </a>
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="admin-button flex items-center gap-1.5 text-xs"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View PDF
                          </a>
                          {inv.status !== 'PAID' && (
                            <button
                              onClick={() => void sendDocument(inv.id)}
                              disabled={working === `send:${inv.id}` || !inv.lineUserId}
                              className="admin-button flex items-center gap-1.5 text-xs"
                              title={!inv.lineUserId ? 'Tenant has no LINE account linked' : undefined}
                            >
                              <Send className="h-3.5 w-3.5" />
                              {working === `send:${inv.id}`
                                ? 'Sending...'
                                : !inv.lineUserId
                                ? 'No LINE'
                                : delivery?.status === 'FAILED'
                                ? 'Retry'
                                : 'Send'}
                            </button>
                          )}
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
