'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Inbox,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { exportToCsv } from '@/lib/utils/export-csv';
import { isLineConfigured } from '@/lib/line';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceStatus = 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
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
  GENERATED: { label: 'สร้างแล้ว',     cls: 'bg-blue-100 text-blue-700 border-blue-200'       },
  SENT:      { label: 'ส่งแล้ว',       cls: 'bg-primary-container text-primary-container'    },
  VIEWED:    { label: 'เปิดดูแล้ว',   cls: 'bg-tertiary-container text-on-tertiary-container' },
  PAID:      { label: 'ชำระแล้ว',     cls: 'bg-tertiary-container text-on-tertiary-container' },
  OVERDUE:   { label: 'เกินกำหนด',   cls: 'bg-error-container text-on-error-container'       },
  CANCELLED: { label: 'ยกเลิก',        cls: 'bg-slate-100 text-slate-500 border-slate-200'    },
};

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL',       label: 'ทั้งหมด'    },
  { value: 'GENERATED', label: 'สร้างแล้ว'  },
  { value: 'SENT',      label: 'ส่งแล้ว'     },
  { value: 'VIEWED',    label: 'เปิดดูแล้ว' },
  { value: 'PAID',      label: 'ชำระแล้ว'   },
  { value: 'OVERDUE',   label: 'เกินกำหนด'  },
];

const SENDABLE: InvoiceStatus[] = ['GENERATED', 'VIEWED'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: 'THB', maximumFractionDigits: 0,
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
  if (inv.billingCycleId) return `/admin/billing/${inv.billingCycleId}?tab=invoices`;
  return `/admin/billing?year=${inv.year}&month=${inv.month}`;
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({ label, value, icon, iconBg }: { label: string; value: number; icon: React.ReactNode; iconBg: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
      <div className="flex items-start gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconBg}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-on-surface">{value}</p>
        </div>
      </div>
    </div>
  );
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

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (pg = 1, status: StatusFilter = 'ALL') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(pg), pageSize: String(PAGE_SIZE),
        sortBy: 'createdAt', sortOrder: 'desc',
      });
      if (status !== 'ALL') params.set('status', status);

      const res = await fetch(`/api/invoices?${params.toString()}`, { cache: 'no-store' }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message ?? 'Failed to load invoices');

      const payload = res.data as { data: InvoiceRow[]; total: number; page: number; totalPages: number };
      setInvoices(payload.data ?? []);
      setTotal(payload.total ?? 0);
      setPage(pg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1, statusFilter); }, [load, statusFilter]);

  async function sendInvoice(id: string) {
    if (!isLineConfigured()) { setError('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งได้'); return; }
    setSending(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'LINE' }),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.error?.message ?? 'Send failed');
      setMessage(`Invoice queued for LINE delivery`);
      void load(page, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(null);
    }
  }

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

  const kpi = useMemo(() => {
    const counts: Partial<Record<InvoiceStatus, number>> = {};
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] ?? 0) + 1;
    }
    return counts;
  }, [invoices]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">ใบแจ้งหนี้</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            ติดตามสถานะใบแจ้งหนี้ทุกรอบบิล หากต้องการสร้างหรือส่งเป็นกลุ่ม ให้ไปที่{' '}
            <Link href="/admin/billing" className="text-primary hover:underline font-medium">
              รอบบิล
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCsv(
              'invoices-export',
              filtered.map((inv) => ({
                invoiceNumber: inv.invoiceNumber,
                room: inv.room?.roomNumber ?? '',
                tenant: inv.tenantName ?? '',
                period: fmtPeriod(inv.year, inv.month),
                amount: inv.totalAmount,
                status: STATUS_META[inv.status]?.label ?? inv.status,
                dueDate: inv.dueDate,
                paidDate: inv.paidAt ?? '',
              })),
              [
                { key: 'invoiceNumber', header: 'Invoice No' },
                { key: 'room', header: 'Room' },
                { key: 'tenant', header: 'Tenant' },
                { key: 'period', header: 'Period' },
                { key: 'amount', header: 'Amount' },
                { key: 'status', header: 'Status' },
                { key: 'dueDate', header: 'Due Date' },
                { key: 'paidDate', header: 'Paid Date' },
              ],
            )}
            disabled={loading || filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            ส่งออก CSV
          </button>
          <button
            onClick={() => void load(page, statusFilter)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-3 rounded-xl border border-tertiary-container bg-tertiary-container/20 px-4 py-3 text-sm text-on-tertiary-container">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-error-container bg-error-container/20 px-4 py-3 text-sm text-on-error-container">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="สร้างแล้ว" value={kpi.GENERATED ?? 0} icon={<FileText className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-100 border-blue-200" />
        <KpiCard label="ส่ง/เปิดดูแล้ว" value={(kpi.SENT ?? 0) + (kpi.VIEWED ?? 0)} icon={<Send className="h-5 w-5 text-primary" />} iconBg="bg-primary-container border-primary-container/20" />
        <KpiCard label="ชำระแล้ว" value={kpi.PAID ?? 0} icon={<CheckCircle2 className="h-5 w-5 text-tertiary-container" />} iconBg="bg-tertiary-container border-tertiary-container/20" />
        <KpiCard label="เกินกำหนด" value={kpi.OVERDUE ?? 0} icon={<AlertTriangle className="h-5 w-5 text-on-error-container" />} iconBg="bg-error-container border-error-container/20" />
      </section>

      {/* Status tabs + Search */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl bg-surface-container p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); setSearch(''); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                statusFilter === tab.value
                  ? 'bg-surface-container-lowest text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาห้อง, ผู้เช่า, เลขใบแจ้งหนี้..."
            className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 pl-9 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <span className="text-sm text-on-surface-variant">
          {search.trim() ? `${filtered.length} รายการ` : `${total} ใบแจ้งหนี้`}
        </span>
      </section>

      {/* Invoice table */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <span className="text-sm font-semibold text-on-surface">รายการใบแจ้งหนี้</span>
          {statusFilter !== 'ALL' && (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[statusFilter as InvoiceStatus]?.cls ?? ''}`}>
              {STATUS_META[statusFilter as InvoiceStatus]?.label ?? statusFilter}
            </span>
          )}
        </div>

        {/* Empty state */}
        {!loading && invoices.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container">
              <Inbox className="h-7 w-7 text-on-surface-variant" />
            </div>
            <p className="text-base font-semibold text-on-surface">ไม่พบใบแจ้งหนี้</p>
            <p className="text-sm text-on-surface-variant">
              {statusFilter !== 'ALL'
                ? `ไม่มีใบแจ้งหนี้สถานะ ${statusFilter.toLowerCase()} ลองเปลี่ยนตัวกรอง`
                : 'ยังไม่มีการสร้างใบแจ้งหนี้ ไปที่รอบบิลเพื่อเริ่มต้น'}
            </p>
            <Link href="/admin/billing" className="mt-1 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90">
              ไปที่รอบบิล
            </Link>
          </div>
        )}

        {(loading || invoices.length > 0) && (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">เลขใบแจ้งหนี้</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">ห้อง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">ผู้เช่า</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">เดือน</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">สถานะ</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">วันครบกำหนด</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-on-surface-variant">จำนวน</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-on-surface-variant">
                      <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-outline" />
                      กำลังโหลดใบแจ้งหนี้...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-on-surface-variant">
                      ไม่พบใบแจ้งหนี้ที่ตรงกับการค้นหา
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const meta = STATUS_META[inv.status];
                    const canSend = SENDABLE.includes(inv.status);
                    const isSending = sending === inv.id;

                    return (
                      <tr key={inv.id} className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                        {/* Invoice number */}
                        <td className="px-4 py-3">
                          <Link href={`/admin/invoices/${inv.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                            {inv.invoiceNumber}
                          </Link>
                        </td>

                        {/* Room */}
                        <td className="px-4 py-3">
                          <span className="font-semibold text-on-surface">{roomNum(inv)}</span>
                        </td>

                        {/* Tenant */}
                        <td className="px-4 py-3 text-on-surface-variant">{inv.tenantName ?? '—'}</td>

                        {/* Period */}
                        <td className="px-4 py-3 text-on-surface-variant">{fmtPeriod(inv.year, inv.month)}</td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta?.cls ?? 'bg-surface-container text-on-surface-variant'}`}>
                            {meta?.label ?? inv.status}
                          </span>
                          {inv.sentAt && (
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-on-surface-variant/60">
                              <Clock className="h-2.5 w-2.5" />
                              {fmtDate(inv.sentAt)}
                            </div>
                          )}
                        </td>

                        {/* Due date */}
                        <td className="px-4 py-3">
                          <span className={inv.status === 'OVERDUE' ? 'font-semibold text-on-error-container' : 'text-on-surface-variant'}>
                            {fmtDate(inv.dueDate)}
                          </span>
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3 text-right">
                          <span className={`tabular-nums font-semibold ${
                            inv.status === 'PAID' ? 'text-on-tertiary-container'
                              : inv.status === 'OVERDUE' ? 'text-on-error-container'
                              : 'text-on-surface'
                          }`}>
                            {money(inv.totalAmount)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {inv.status !== 'CANCELLED' && (
                              <a
                                href={`/api/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                PDF
                              </a>
                            )}

                            {canSend && (
                              <button
                                onClick={() => void sendInvoice(inv.id)}
                                disabled={isSending || sending !== null}
                                className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-60"
                              >
                                <Send className="h-3.5 w-3.5" />
                                {isSending ? 'กำลังส่ง…' : 'ส่ง'}
                              </button>
                            )}

                            <Link
                              href={billingCycleLink(inv)}
                              className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              รอบบิล
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-outline-variant px-4 py-3">
            <span className="text-xs text-on-surface-variant">
              หน้า {page} จาก {totalPages} · {total} รายการ
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void load(page - 1, statusFilter)}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                ← ก่อนหน้า
              </button>
              <button
                onClick={() => void load(page + 1, statusFilter)}
                disabled={page >= totalPages || loading}
                className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container disabled:opacity-40"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
