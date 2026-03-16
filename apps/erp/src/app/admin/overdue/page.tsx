'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  MessageCircle,
  Send,
  TrendingUp,
} from 'lucide-react';

type OverdueInvoice = {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: number;
  status: string;
  room?: { roomNumber: string } | null;
  contract?: {
    tenant?: {
      firstName: string;
      lastName: string;
    } | null;
  } | null;
  // fallback flat fields some API shapes may return
  tenantName?: string;
  roomNumber?: string;
};

type OverdueRange = 'all' | '1-30' | '31-60' | '60+';

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function daysSince(dateStr: string): number {
  const due = new Date(dateStr);
  const now = new Date();
  const ms = now.getTime() - due.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function daysOverdueBadge(days: number): string {
  if (days <= 30) return 'bg-amber-100 text-amber-800 border border-amber-200';
  if (days <= 60) return 'bg-orange-100 text-orange-800 border border-orange-200';
  return 'bg-red-100 text-red-800 border border-red-200';
}

function daysOverdueText(days: number): string {
  if (days <= 30) return 'text-amber-700';
  if (days <= 60) return 'text-orange-700';
  return 'text-red-700';
}

function tenantName(inv: OverdueInvoice): string {
  if (inv.tenantName) return inv.tenantName;
  const t = inv.contract?.tenant;
  if (t) return `${t.firstName} ${t.lastName}`.trim();
  return '—';
}

function roomNum(inv: OverdueInvoice): string {
  return inv.room?.roomNumber ?? inv.roomNumber ?? '—';
}

function exportCsv(invoices: OverdueInvoice[]) {
  const header = ['Room', 'Tenant', 'Invoice #', 'Due Date', 'Days Overdue', 'Amount (THB)'];
  const rows = invoices.map((inv) => {
    const days = daysSince(inv.dueDate);
    return [
      roomNum(inv),
      tenantName(inv),
      inv.invoiceNumber ?? inv.id,
      new Date(inv.dueDate).toLocaleDateString('en-GB'),
      String(days),
      String(inv.totalAmount),
    ];
  });
  const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `overdue-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminOverduePage() {
  const [invoices, setInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<OverdueRange>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices?status=OVERDUE&pageSize=100', {
        cache: 'no-store',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to load overdue invoices');
      const raw: OverdueInvoice[] = res.data?.data ?? res.data ?? [];
      setInvoices(raw);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load overdue invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = invoices;

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (inv) =>
          roomNum(inv).toLowerCase().includes(q) ||
          tenantName(inv).toLowerCase().includes(q) ||
          (inv.invoiceNumber ?? inv.id).toLowerCase().includes(q)
      );
    }

    if (range !== 'all') {
      rows = rows.filter((inv) => {
        const d = daysSince(inv.dueDate);
        if (range === '1-30') return d >= 1 && d <= 30;
        if (range === '31-60') return d >= 31 && d <= 60;
        if (range === '60+') return d > 60;
        return true;
      });
    }

    return rows.sort((a, b) => daysSince(b.dueDate) - daysSince(a.dueDate));
  }, [invoices, search, range]);

  const kpi = useMemo(() => {
    const total = invoices.length;
    const totalAmount = invoices.reduce((s, inv) => s + inv.totalAmount, 0);
    const avgDays =
      total > 0
        ? Math.round(invoices.reduce((s, inv) => s + daysSince(inv.dueDate), 0) / total)
        : 0;
    const uniqueRooms = new Set(invoices.map((inv) => roomNum(inv))).size;
    return { total, totalAmount, avgDays, uniqueRooms };
  }, [invoices]);

  async function sendReminder(id: string) {
    setWorking(`remind:${id}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'LINE' }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Failed to send reminder');
      setMessage('Reminder sent via LINE');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reminder');
    } finally {
      setWorking(null);
    }
  }

  async function sendAllReminders() {
    if (filtered.length === 0) return;
    setWorking('all');
    setError(null);
    setMessage(null);
    let sent = 0;
    let failed = 0;
    for (const inv of filtered) {
      try {
        const res = await fetch(`/api/invoices/${inv.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'LINE' }),
        }).then((r) => r.json());
        if (res.success) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    setWorking(null);
    setMessage(
      `Reminders sent: ${sent} succeeded${failed > 0 ? `, ${failed} failed` : ''}`
    );
  }

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Overdue Management</h1>
          <p className="admin-page-subtitle">Track and follow up on overdue invoices</p>
        </div>
        <div className="admin-toolbar">
          <button
            onClick={() => void sendAllReminders()}
            disabled={working === 'all' || filtered.length === 0}
            className="admin-button admin-button-primary flex items-center gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            {working === 'all' ? 'Sending...' : `Send Reminders to All (${filtered.length})`}
          </button>
          <button
            onClick={() => exportCsv(filtered)}
            className="admin-button flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </section>

      {message && <div className="auth-alert auth-alert-success">{message}</div>}
      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* KPI row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="admin-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="admin-kpi-label">Total Overdue</div>
              <div className="admin-kpi-value">{loading ? '...' : kpi.total}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>

        <div className="admin-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="admin-kpi-label">Total Overdue Amount</div>
              <div className="admin-kpi-value text-red-700">
                {loading ? '...' : money(kpi.totalAmount)}
              </div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 shadow-sm">
              <TrendingUp className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="admin-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="admin-kpi-label">Avg Days Overdue</div>
              <div className="admin-kpi-value">{loading ? '...' : kpi.avgDays}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="admin-kpi">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="admin-kpi-label">Rooms with Overdue</div>
              <div className="admin-kpi-value">{loading ? '...' : kpi.uniqueRooms}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
              <AlertTriangle className="h-5 w-5 text-slate-500" />
            </div>
          </div>
        </div>
      </section>

      {/* Action bar */}
      <section className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search room, tenant, invoice #..."
          className="admin-input min-w-[220px] flex-1"
        />
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {(['all', '1-30', '31-60', '60+'] as OverdueRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                range === r
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {r === 'all' ? 'All' : r === '60+' ? '60d+' : `${r}d`}
            </button>
          ))}
        </div>
      </section>

      {/* Overdue table */}
      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title">Overdue Invoices</div>
          <span className="admin-badge">{filtered.length} invoices</span>
        </div>

        {/* Empty state */}
        {!loading && invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-lg font-semibold text-slate-700">All caught up!</p>
            <p className="text-sm text-slate-500">No overdue invoices at this time.</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Room #</th>
                  <th>Tenant Name</th>
                  <th>Invoice #</th>
                  <th>Due Date</th>
                  <th>Days Overdue</th>
                  <th>Amount (THB)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      Loading overdue invoices...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No overdue invoices match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const days = daysSince(inv.dueDate);
                    return (
                      <tr key={inv.id}>
                        <td>
                          <span className="font-semibold text-slate-800">{roomNum(inv)}</span>
                        </td>
                        <td>{tenantName(inv)}</td>
                        <td>
                          <span className="font-mono text-sm text-slate-700">
                            {inv.invoiceNumber ?? inv.id.slice(0, 8)}
                          </span>
                        </td>
                        <td>{new Date(inv.dueDate).toLocaleDateString('en-GB')}</td>
                        <td>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${daysOverdueBadge(days)}`}
                          >
                            <Clock className={`h-3 w-3 ${daysOverdueText(days)}`} />
                            {days}d
                          </span>
                        </td>
                        <td>
                          <span className="font-semibold text-red-700">{money(inv.totalAmount)}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => void sendReminder(inv.id)}
                              disabled={working === `remind:${inv.id}` || working === 'all'}
                              className="admin-button flex items-center gap-1.5 text-xs"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {working === `remind:${inv.id}` ? 'Sending...' : 'Send Reminder'}
                            </button>
                            <Link
                              href={`/admin/invoices`}
                              className="admin-button flex items-center gap-1.5 text-xs"
                            >
                              View Invoice
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
      </section>
    </main>
  );
}
