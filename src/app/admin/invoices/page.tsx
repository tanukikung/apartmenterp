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
import { ModernTable } from '@/components/ui/modern-table';
import { StatusBadge, invoiceStatusVariant } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceStatus = 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
type StatusFilter = 'ALL' | InvoiceStatus;

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  roomNo: string;
  roomBillingId: string;
  billingPeriodId?: string | null;
  year: number;
  month: number;
  status: InvoiceStatus;
  totalAmount: number;
  dueDate: string;
  sentAt?: string | null;
  paidAt?: string | null;
  room?: { roomNo: string; roomNumber: string } | null;
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
  SENT:      { label: 'ส่งแล้ว',       cls: 'bg-[var(--primary-container)] text-[var(--primary-container)]'    },
  VIEWED:    { label: 'เปิดดูแล้ว',   cls: 'bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]' },
  PAID:      { label: 'ชำระแล้ว',     cls: 'bg-[var(--tertiary-container)] text-[var(--on-tertiary-container)]' },
  OVERDUE:   { label: 'เกินกำหนด',   cls: 'bg-[var(--error-container)] text-[var(--on-error-container)]'       },
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
  return inv.room?.roomNumber ?? inv.room?.roomNo ?? inv.roomNo ?? '—';
}

function billingCycleLink(inv: InvoiceRow): string {
  if (inv.billingPeriodId) return `/admin/billing/${inv.billingPeriodId}?tab=invoices`;
  return `/admin/billing?year=${inv.year}&month=${inv.month}`;
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({ label, value, icon, iconBg }: { label: string; value: number; icon: React.ReactNode; iconBg: string }) {
  return (
    <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-all">
      <div className="flex items-start gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconBg}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--on-surface)]">{value}</p>
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
      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถโหลดใบแจ้งหนี้');

      const payload = res.data as { data: InvoiceRow[]; total: number; page: number; totalPages: number };
      setInvoices(payload.data ?? []);
      setTotal(payload.total ?? 0);
      setPage(pg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดใบแจ้งหนี้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1, statusFilter); }, [load, statusFilter]);

  async function sendInvoice(id: string) {
    // LINE configuration check is done server-side; proceed and let API return error if not configured
    setSending(id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'LINE' }),
      }).then((r) => r.json());

      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถส่งใบแจ้งหนี้');
      setMessage(`ส่งใบแจ้งหนี้ทาง LINE แล้ว`);
      void load(page, statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถส่งใบแจ้งหนี้');
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
          <h1 className="text-2xl font-bold text-[var(--on-surface)]">ใบแจ้งหนี้</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
            ติดตามสถานะใบแจ้งหนี้ทุกรอบบิล หากต้องการสร้างหรือส่งเป็นกลุ่ม ให้ไปที่{' '}
            <Link href="/admin/billing" className="text-[var(--primary)] hover:underline font-medium">
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
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            ส่งออก CSV
          </button>
          <button
            onClick={() => void load(page, statusFilter)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {message && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--tertiary-container)] bg-[var(--tertiary-container)]/20 px-4 py-3 text-sm text-[var(--on-tertiary-container)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--error-container)] bg-[var(--error-container)]/20 px-4 py-3 text-sm text-[var(--on-error-container)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="สร้างแล้ว" value={kpi.GENERATED ?? 0} icon={<FileText className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-100 border-blue-200" />
        <KpiCard label="ส่ง/เปิดดูแล้ว" value={(kpi.SENT ?? 0) + (kpi.VIEWED ?? 0)} icon={<Send className="h-5 w-5 text-[var(--primary)]" />} iconBg="bg-[var(--primary-container)] border-primary-container/20" />
        <KpiCard label="ชำระแล้ว" value={kpi.PAID ?? 0} icon={<CheckCircle2 className="h-5 w-5 text-[var(--tertiary-container)]" />} iconBg="bg-[var(--tertiary-container)] border-[var(--tertiary-container)]/20" />
        <KpiCard label="เกินกำหนด" value={kpi.OVERDUE ?? 0} icon={<AlertTriangle className="h-5 w-5 text-[var(--on-error-container)]" />} iconBg="bg-[var(--error-container)] border-[var(--error-container)]/20" />
      </section>

      {/* Status tabs + Search */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-container)] p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); setSearch(''); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                statusFilter === tab.value
                  ? 'bg-[var(--surface-container-lowest)] text-[var(--primary)] shadow-sm'
                  : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-surface-variant)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาห้อง, ผู้เช่า, เลขใบแจ้งหนี้..."
            className="w-full rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 pl-9 pr-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </div>

        <span className="text-sm text-[var(--on-surface-variant)]">
          {search.trim() ? `${filtered.length} รายการ` : `${total} ใบแจ้งหนี้`}
        </span>
      </section>

      {/* Invoice table */}
      <ModernTable
        header={
          <>
            <span className="text-sm font-semibold text-[var(--on-surface)]">รายการใบแจ้งหนี้</span>
            {statusFilter !== 'ALL' && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_META[statusFilter as InvoiceStatus]?.cls ?? ''}`}>
                {STATUS_META[statusFilter as InvoiceStatus]?.label ?? statusFilter}
              </span>
            )}
          </>
        }
        columns={[
          {
            key: 'invoiceNumber', header: 'เลขใบแจ้งหนี้', sortable: true,
            render: (inv) => (
              <Link href={`/admin/invoices/${inv.id}`} className="font-mono text-xs font-medium text-[var(--primary)] hover:underline">
                {inv.invoiceNumber}
              </Link>
            ),
          },
          {
            key: 'roomNo', header: 'ห้อง', sortable: true,
            render: (inv) => <span className="font-semibold text-[var(--on-surface)]">{roomNum(inv)}</span>,
          },
          { key: 'tenantName', header: 'ผู้เช่า', sortable: true, render: (inv) => <span className="text-sm text-[var(--on-surface)]">{inv.tenantName ?? '—'}</span> },
          {
            key: 'period', header: 'เดือน', sortable: true,
            render: (inv) => <span className="text-sm text-[var(--on-surface-variant)]">{fmtPeriod(inv.year, inv.month)}</span>,
          },
          {
            key: 'status', header: 'สถานะ', sortable: true,
            render: (inv) => {
              const meta = STATUS_META[inv.status];
              return (
                <div className="flex flex-col gap-1">
                  <StatusBadge variant={invoiceStatusVariant(inv.status)}>
                    {meta?.label ?? inv.status}
                  </StatusBadge>
                  {inv.sentAt && (
                    <div className="flex items-center gap-1 text-[10px] text-[var(--on-surface-variant)]/60">
                      <Clock className="h-2.5 w-2.5" />
                      {fmtDate(inv.sentAt)}
                    </div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'dueDate', header: 'วันครบกำหนด', sortable: true,
            render: (inv) => (
              <span className={inv.status === 'OVERDUE' ? 'font-semibold text-[var(--color-danger)]' : 'text-sm text-[var(--on-surface-variant)]'}>
                {fmtDate(inv.dueDate)}
              </span>
            ),
          },
          {
            key: 'totalAmount', header: 'จำนวน', sortable: true, align: 'right',
            render: (inv) => (
              <span className={`tabular-nums font-semibold ${
                inv.status === 'PAID' ? 'text-emerald-600'
                  : inv.status === 'OVERDUE' ? 'text-[var(--color-danger)]'
                  : 'text-[var(--on-surface)]'
              }`}>
                {money(inv.totalAmount)}
              </span>
            ),
          },
          {
            key: 'actions', header: 'จัดการ',
            align: 'left',
            render: (inv) => {
              const canSend = SENDABLE.includes(inv.status);
              const isSending = sending === inv.id;
              return (
                <div className="flex items-center gap-1.5">
                  {inv.status !== 'CANCELLED' && (
                    <a
                      href={`/api/invoices/${inv.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-2.5 py-1.5 text-xs font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      PDF
                    </a>
                  )}
                  {canSend && (
                    <button
                      onClick={() => void sendInvoice(inv.id)}
                      disabled={isSending || sending !== null}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-2.5 py-1.5 text-xs font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)] disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {isSending ? 'กำลังส่ง…' : 'ส่ง'}
                    </button>
                  )}
                  <Link
                    href={billingCycleLink(inv)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-2.5 py-1.5 text-xs font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    รอบบิล
                  </Link>
                </div>
              );
            },
          },
        ]}
        data={filtered}
        loading={loading}
        pagination={totalPages > 1 ? { page, pageSize: PAGE_SIZE, total, onPageChange: (p) => void load(p, statusFilter) } : undefined}
        empty={
          <EmptyState
            icon={<Inbox className="h-7 w-7" />}
            title="ไม่พบใบแจ้งหนี้"
            description={statusFilter !== 'ALL'
              ? `ไม่มีใบแจ้งหนี้สถานะ ${statusFilter.toLowerCase()} ลองเปลี่ยนตัวกรอง`
              : 'ยังไม่มีการสร้างใบแจ้งหนี้ ไปที่รอบบิลเพื่อเริ่มต้น'}
            action={{ label: 'ไปที่รอบบิล', href: '/admin/billing' }}
          />
        }
      />
    </main>
  );
}
