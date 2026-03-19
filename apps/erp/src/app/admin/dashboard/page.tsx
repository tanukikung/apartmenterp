'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Building2,
  Receipt,
  AlertTriangle,
  CreditCard,
  Wrench,
  Plus,
  CheckSquare,
  Send,
  ArrowRight,
  MessageSquare,
  Clock,
  Circle,
  DollarSign,
  Home,
  FileText,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type SummaryData = {
  monthlyRevenue: number;
  unpaidInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
};

type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
};

type RevenuePoint = { year: number; month: number; total: number };

type Invoice = {
  id: string;
  year: number;
  month: number;
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE';
  totalAmount?: number;
  total?: number;
  dueDate?: string | null;
  sentAt?: string | null;
  room?: { roomNumber?: string } | null;
  tenant?: { fullName?: string | null } | null;
  billingRecord?: { tenant?: { fullName?: string | null } | null } | null;
};

type InvoiceListResponse = {
  data: Invoice[];
  total: number;
};

type Payment = {
  id: string;
  amount: number;
  transactionDate: string;
  status: string;
  reference?: string | null;
};

type MaintenanceTicket = {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'DONE' | 'CLOSED';
  room?: { roomNumber?: string } | null;
  createdAt: string;
};

type Conversation = {
  id: string;
  lastMessageAt: string;
  unreadCount: number;
  room?: { roomNumber?: string } | null;
  tenant?: { fullName?: string | null } | null;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  userName: string;
  createdAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function moneyCompact(amount: number): string {
  if (amount >= 1_000_000) return `฿${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `฿${(amount / 1_000).toFixed(0)}K`;
  return `฿${amount.toFixed(0)}`;
}

const MONTH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function monthLabel(point: RevenuePoint): string {
  return MONTH_ABBR[(point.month - 1) % 12] ?? `${point.month}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'เมื่อกี้';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  return `${Math.floor(hrs / 24)} วันที่แล้ว`;
}

function todayThai(): string {
  return new Date().toLocaleDateString('th-TH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function priorityColor(p: MaintenanceTicket['priority']): string {
  if (p === 'URGENT') return 'text-red-600 bg-red-50 border-red-200';
  if (p === 'HIGH') return 'text-orange-600 bg-orange-50 border-orange-200';
  if (p === 'MEDIUM') return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-slate-500 bg-slate-50 border-slate-200';
}

function statusBadge(status: Invoice['status']): { label: string; cls: string } {
  switch (status) {
    case 'PAID': return { label: 'ชำระแล้ว', cls: 'admin-status-good' };
    case 'OVERDUE': return { label: 'เกินกำหนด', cls: 'admin-status-bad' };
    case 'SENT': return { label: 'ส่งแล้ว', cls: 'admin-status-warn' };
    case 'VIEWED': return { label: 'เปิดดูแล้ว', cls: 'admin-status-warn' };
    case 'DRAFT': return { label: 'ร่าง', cls: '' };
    default: return { label: status, cls: '' };
  }
}

function invoiceAmount(inv: Invoice): number {
  return inv.totalAmount ?? inv.total ?? 0;
}

function tenantName(inv: Invoice): string {
  return (
    inv.tenant?.fullName ??
    inv.billingRecord?.tenant?.fullName ??
    '—'
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

type TrendDir = 'up' | 'down' | 'neutral';

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
  trendDir = 'neutral',
  trendLabel,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  trendDir?: TrendDir;
  trendLabel?: string;
  loading: boolean;
}) {
  const TrendIcon = trendDir === 'down' ? TrendingDown : TrendingUp;
  const trendColor =
    trendDir === 'up'
      ? 'text-emerald-600'
      : trendDir === 'down'
      ? 'text-red-500'
      : 'text-slate-400';

  return (
    <div className="admin-kpi cute-surface flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="admin-kpi-label leading-snug">{label}</span>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon size={16} strokeWidth={2} className={iconColor} />
        </div>
      </div>
      <div className="admin-kpi-value leading-none">
        {loading ? <span className="text-slate-300">—</span> : value}
      </div>
      {(trendLabel || sub) && (
        <div className={`flex items-center gap-1 text-xs ${trendDir !== 'neutral' ? trendColor : 'text-slate-400'}`}>
          {trendDir !== 'neutral' && <TrendIcon size={11} strokeWidth={2} />}
          <span>{trendLabel ?? sub}</span>
        </div>
      )}
    </div>
  );
}

// ─── CSS Bar Chart (no recharts) ─────────────────────────────────────────────

function RevenueBarChart({ data }: { data: RevenuePoint[] }) {
  const last6 = data.slice(-6);
  const max = Math.max(...last6.map((d) => d.total), 1);
  return (
    <div className="flex h-44 items-end gap-2 px-1">
      {last6.map((pt, i) => {
        const pct = Math.max(4, (pt.total / max) * 100);
        return (
          <div key={i} className="group flex flex-1 flex-col items-center gap-1">
            <div className="relative flex w-full flex-col items-center">
              {/* Amount tooltip on hover */}
              <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                {moneyCompact(pt.total)}
              </div>
              <div
                className="w-full rounded-t-md bg-indigo-500 transition-all duration-500 group-hover:bg-indigo-600"
                style={{ height: `${pct}%`, minHeight: '4px', maxHeight: '100%' }}
              />
            </div>
            <div className="text-[10px] font-medium text-slate-500">{monthLabel(pt)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [, setOverdueInvoices] = useState<Invoice[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [unmatchedPayments, setUnmatchedPayments] = useState<Payment[]>([]);
  const [openTickets, setOpenTickets] = useState<MaintenanceTicket[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const safe = async (url: string) => {
          try {
            const r = await fetch(url, { cache: 'no-store' });
            return r.ok ? r.json() : null;
          } catch {
            return null;
          }
        };

        const [
          summaryRes,
          occupancyRes,
          revenueRes,
          overdueRes,
          recentRes,
          unmatchedRes,
          maintenanceRes,
          convRes,
          auditRes,
        ] = await Promise.all([
          safe('/api/analytics/summary'),
          safe('/api/analytics/occupancy'),
          safe('/api/analytics/revenue'),
          safe('/api/invoices?status=OVERDUE&pageSize=5'),
          safe('/api/invoices?pageSize=10&sortBy=createdAt&sortOrder=desc'),
          safe('/api/payments?status=PENDING&pageSize=5'),
          safe('/api/admin/maintenance?status=OPEN&pageSize=5'),
          safe('/api/conversations?pageSize=3'),
          safe('/api/audit-logs?pageSize=5'),
        ]);

        if (summaryRes?.success) setSummary(summaryRes.data);
        if (occupancyRes?.success) setOccupancy(occupancyRes.data);
        if (revenueRes?.success) setRevenue(Array.isArray(revenueRes.data) ? revenueRes.data : []);

        // invoices list response: { data: Invoice[], total }
        if (overdueRes?.success) {
          const list: InvoiceListResponse = overdueRes.data;
          setOverdueInvoices(Array.isArray(list?.data) ? list.data : []);
        }
        if (recentRes?.success) {
          const list: InvoiceListResponse = recentRes.data;
          setRecentInvoices(Array.isArray(list?.data) ? list.data : []);
        }

        if (unmatchedRes?.success) {
          const raw = unmatchedRes.data;
          const arr = Array.isArray(raw) ? raw : (raw?.data ?? raw?.transactions ?? []);
          setUnmatchedPayments(arr.slice(0, 5));
        }
        if (maintenanceRes?.success) {
          const raw = maintenanceRes.data;
          const arr = Array.isArray(raw) ? raw : (raw?.data ?? []);
          setOpenTickets(arr.slice(0, 5));
        }
        if (convRes?.success) {
          const raw = convRes.data;
          const arr = Array.isArray(raw) ? raw : (raw?.data ?? []);
          setConversations(arr.slice(0, 3));
        }
        if (auditRes?.success) {
          const raw = auditRes.data;
          const arr = Array.isArray(raw) ? raw : (raw?.rows ?? raw?.data ?? []);
          setAuditLogs(arr.slice(0, 5));
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Derived values
  const occupancyRate = occupancy
    ? Math.round((occupancy.occupiedRooms / Math.max(1, occupancy.totalRooms)) * 100)
    : 0;
  const maintenanceCount = occupancy
    ? Math.max(0, occupancy.totalRooms - occupancy.occupiedRooms - occupancy.vacantRooms)
    : 0;
  const unsentCount = recentInvoices.filter((inv) => inv.status === 'DRAFT' || inv.status === 'GENERATED').length;

  async function handleSendInvoice(invoiceId: string) {
    setSendingId(invoiceId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        return;
      }
      setRecentInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: 'SENT' as const } : inv))
      );
    } finally {
      setSendingId(null);
    }
  }

  return (
    <main className="admin-page">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 pb-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">สวัสดี, Admin</h1>
          <p className="mt-0.5 text-sm text-slate-500">{todayThai()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/billing/import"
            className="admin-button admin-button-primary"
          >
            <Plus size={14} strokeWidth={2.5} />
            Import Billing
          </Link>
          <Link href="/admin/payments/review" className="admin-button">
            <CheckSquare size={14} strokeWidth={2} />
            Review Payments
          </Link>
          <Link href="/admin/invoices" className="admin-button">
            <Send size={14} strokeWidth={2} />
            Send Invoices
          </Link>
        </div>
      </section>

      {/* ── KPI Row — 4 cards ───────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Revenue This Month"
          value={money(summary?.monthlyRevenue ?? 0)}
          trendDir="up"
          trendLabel="from last month"
          icon={DollarSign}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          loading={loading}
        />
        <KpiCard
          label="Occupancy Rate"
          value={`${occupancyRate}%`}
          trendDir={occupancyRate >= 80 ? 'up' : 'neutral'}
          trendLabel={`${occupancy?.occupiedRooms ?? 0} / ${occupancy?.totalRooms ?? 0} ห้อง`}
          icon={Home}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          loading={loading}
        />
        <KpiCard
          label="Unpaid Invoices"
          value={summary?.unpaidInvoices ?? 0}
          trendDir="neutral"
          trendLabel="รอการชำระ"
          icon={FileText}
          iconBg="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
        />
        <KpiCard
          label="Overdue Invoices"
          value={summary?.overdueInvoices ?? 0}
          trendDir={(summary?.overdueInvoices ?? 0) > 0 ? 'down' : 'neutral'}
          trendLabel="ต้องติดตามชำระ"
          icon={AlertTriangle}
          iconBg="bg-red-50"
          iconColor="text-red-500"
          loading={loading}
        />
      </section>

      {/* ── Two-column layout: charts left, list right ──────────── */}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">

        {/* Left 2/3 */}
        <div className="space-y-6">

          {/* Revenue Trend */}
          <div className="admin-card cute-surface">
            <div className="admin-card-header">
              <div className="admin-card-title">Monthly Revenue Trend</div>
              <span className="admin-badge">6 เดือนล่าสุด</span>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="flex h-44 items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>
              ) : revenue.length === 0 ? (
                <div className="flex h-44 items-center justify-center text-sm text-slate-400">ไม่มีข้อมูลรายรับ</div>
              ) : (
                <RevenueBarChart data={revenue} />
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="admin-card cute-surface overflow-hidden">
            <div className="admin-card-header">
              <div className="admin-card-title">Recent Invoices</div>
              <Link href="/admin/invoices" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                ดูทั้งหมด <ArrowRight size={12} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-5 text-sm text-slate-400">กำลังโหลด...</div>
              ) : recentInvoices.length === 0 ? (
                <div className="p-5 text-sm text-slate-400">ไม่มีข้อมูลใบแจ้งหนี้</div>
              ) : (
                <table className="admin-table w-full">
                  <thead>
                    <tr>
                      <th>ห้อง</th>
                      <th>ผู้เช่า</th>
                      <th>เดือน</th>
                      <th className="text-right">จำนวน</th>
                      <th>สถานะ</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map((inv) => {
                      const badge = statusBadge(inv.status);
                      const canSend = inv.status === 'DRAFT' || inv.status === 'GENERATED';
                      return (
                        <tr key={inv.id}>
                          <td className="font-mono text-xs">{inv.room?.roomNumber ?? '—'}</td>
                          <td className="max-w-[120px] truncate text-slate-700">{tenantName(inv)}</td>
                          <td className="text-slate-500">
                            {MONTH_ABBR[(inv.month - 1) % 12]} {inv.year}
                          </td>
                          <td className="text-right font-medium text-slate-800">
                            {money(invoiceAmount(inv))}
                          </td>
                          <td>
                            <span className={`admin-badge ${badge.cls}`}>{badge.label}</span>
                          </td>
                          <td>
                            {canSend && (
                              <button
                                onClick={() => handleSendInvoice(inv.id)}
                                disabled={sendingId === inv.id}
                                className="flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                              >
                                <Send size={10} strokeWidth={2} />
                                {sendingId === inv.id ? '...' : 'ส่ง'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right 1/3 */}
        <div className="space-y-6">

          {/* Tasks Today */}
          <div className="admin-card cute-surface">
            <div className="admin-card-header">
              <div className="admin-card-title">Tasks Today</div>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <div className={`h-2 w-2 rounded-full ${unmatchedPayments.length > 0 ? 'bg-amber-400' : 'bg-slate-200'}`} />
                  <span className="text-sm text-slate-700">
                    Unmatched payments
                    {unmatchedPayments.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        {unmatchedPayments.length}
                      </span>
                    )}
                  </span>
                </div>
                <Link href="/admin/payments/review" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                  Review <ArrowRight size={11} />
                </Link>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <div className={`h-2 w-2 rounded-full ${unsentCount > 0 ? 'bg-indigo-400' : 'bg-slate-200'}`} />
                  <span className="text-sm text-slate-700">
                    Unsent invoices
                    {unsentCount > 0 && (
                      <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {unsentCount}
                      </span>
                    )}
                  </span>
                </div>
                <Link href="/admin/invoices" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                  Send <ArrowRight size={11} />
                </Link>
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <div className={`h-2 w-2 rounded-full ${(summary?.overdueInvoices ?? 0) > 0 ? 'bg-red-400' : 'bg-slate-200'}`} />
                  <span className="text-sm text-slate-700">
                    Overdue tenants
                    {(summary?.overdueInvoices ?? 0) > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        {summary?.overdueInvoices}
                      </span>
                    )}
                  </span>
                </div>
                <Link href="/admin/overdue" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                  Manage <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="admin-card cute-surface">
            <div className="admin-card-header">
              <div className="admin-card-title">Recent Activity</div>
              <Link href="/admin/audit-logs" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                ดูทั้งหมด <ArrowRight size={12} />
              </Link>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="text-sm text-slate-400">กำลังโหลด...</div>
              ) : auditLogs.length === 0 ? (
                <div className="text-sm text-slate-400">ไม่มีกิจกรรมล่าสุด</div>
              ) : (
                <ol className="relative border-l border-slate-200 pl-4 space-y-4">
                  {auditLogs.map((log) => (
                    <li key={log.id} className="relative">
                      <div className="absolute -left-[21px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-200 bg-white">
                        <Circle size={6} className="fill-indigo-400 text-indigo-400" />
                      </div>
                      <p className="text-xs font-medium text-slate-800 leading-snug">
                        {log.action}{' '}
                        <span className="font-normal text-slate-500">{log.entityType}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {log.userName} · {timeAgo(log.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Rooms At a Glance */}
          <div className="admin-card cute-surface">
            <div className="admin-card-header">
              <div className="admin-card-title">Rooms At a Glance</div>
              <span className="admin-badge">{occupancy?.totalRooms ?? 0} ทั้งหมด</span>
            </div>
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                  <span className="text-sm text-slate-700">Occupied</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{loading ? '—' : occupancy?.occupiedRooms ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <span className="text-sm text-slate-700">Vacant</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{loading ? '—' : occupancy?.vacantRooms ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="text-sm text-slate-700">Maintenance</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{loading ? '—' : maintenanceCount}</span>
              </div>
              {/* Simple visual proportion bar */}
              {!loading && occupancy && occupancy.totalRooms > 0 && (
                <div className="mt-2 flex h-3 overflow-hidden rounded-full">
                  <div
                    className="bg-green-500 transition-all"
                    style={{ width: `${(occupancy.occupiedRooms / occupancy.totalRooms) * 100}%` }}
                  />
                  <div
                    className="bg-amber-400 transition-all"
                    style={{ width: `${(maintenanceCount / occupancy.totalRooms) * 100}%` }}
                  />
                  <div className="flex-1 bg-slate-200" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom Section ──────────────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-2">

        {/* Recent Conversations */}
        <div className="admin-card cute-surface overflow-hidden">
          <div className="admin-card-header">
            <div className="flex items-center gap-2">
              <MessageSquare size={13} className="text-slate-400" />
              <div className="admin-card-title">Recent Conversations</div>
            </div>
            <Link href="/admin/chat" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
              ดูทั้งหมด <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-5 text-sm text-slate-400">กำลังโหลด...</div>
            ) : conversations.length === 0 ? (
              <div className="p-5 text-sm text-slate-400">ไม่มีการสนทนาล่าสุด</div>
            ) : (
              conversations.map((conv) => (
                <Link
                  key={conv.id}
                  href="/admin/chat"
                  className="dashboard-list-item flex items-center justify-between px-5 py-3.5 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-semibold text-indigo-700">
                      {(conv.tenant?.fullName ?? '?').charAt(0).toUpperCase()}
                      {conv.unreadCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{conv.tenant?.fullName ?? 'ไม่ระบุผู้เช่า'}</div>
                      <div className="text-xs text-slate-500">ห้อง {conv.room?.roomNumber ?? '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock size={10} />
                    {timeAgo(conv.lastMessageAt)}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Maintenance Alerts */}
        <div className="admin-card cute-surface overflow-hidden">
          <div className="admin-card-header">
            <div className="flex items-center gap-2">
              <Wrench size={13} className="text-slate-400" />
              <div className="admin-card-title">Maintenance Alerts</div>
            </div>
            <Link href="/admin/maintenance" className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
              ดูทั้งหมด <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-5 text-sm text-slate-400">กำลังโหลด...</div>
            ) : openTickets.length === 0 ? (
              <div className="p-5 text-sm text-slate-400">ไม่มีงานซ่อมที่รอดำเนินการ</div>
            ) : (
              openTickets
                .slice()
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map((ticket) => (
                  <div key={ticket.id} className="dashboard-list-item flex items-start justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{ticket.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <span>ห้อง {ticket.room?.roomNumber ?? '—'}</span>
                        <span>·</span>
                        <Clock size={10} />
                        <span>{timeAgo(ticket.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`admin-badge ${priorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
