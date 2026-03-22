'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import {
  Plus,
  CheckSquare,
  Send,
  ArrowRight,
  MessageSquare,
  Clock,
  DollarSign,
  Home,
  FileText,
  TrendingUp,
  TrendingDown,
  Inbox,
  Wrench,
  BarChart2,
  AlertTriangle,
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
  if (p === 'URGENT') return 'bg-red-50 text-red-700 border-red-200';
  if (p === 'HIGH') return 'bg-orange-50 text-orange-700 border-orange-200';
  if (p === 'MEDIUM') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-surface-container text-on-surface-variant border-outline';
}

function statusBadge(status: Invoice['status']): { label: string; cls: string } {
  switch (status) {
    case 'PAID': return { label: 'ชำระแล้ว', cls: 'bg-tertiary-container text-on-tertiary-container' };
    case 'OVERDUE': return { label: 'เกินกำหนด', cls: 'bg-error-container text-on-error-container' };
    case 'SENT': return { label: 'ส่งแล้ว', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'VIEWED': return { label: 'เปิดดูแล้ว', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'DRAFT': return { label: 'ร่าง', cls: 'bg-surface-container text-on-surface' };
    default: return { label: status, cls: 'bg-surface-container text-on-surface' };
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

const AVATAR_COLORS = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-blue-100 text-blue-700'];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

type TrendDir = 'up' | 'down' | 'neutral';

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accentClass = 'bg-surface-container-lowest',
  trendDir = 'neutral',
  trendLabel,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accentClass?: string;
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
      : 'text-on-surface-variant';

  if (loading) {
    return (
      <div className={`${accentClass} p-5 rounded-xl border border-outline-variant/10 skeleton`} style={{ height: '120px' }} />
    );
  }

  return (
    <div className={`${accentClass} p-5 rounded-xl border border-outline-variant/10 hover:shadow-lg transition-all duration-200`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</span>
        <div className="h-9 w-9 rounded-xl bg-primary-container/10 flex items-center justify-center">
          <Icon size={16} strokeWidth={2} className="text-primary" />
        </div>
      </div>
      <div className="text-2xl font-extrabold tracking-tight text-primary leading-none mb-2">{value}</div>
      {(trendLabel || sub) && (
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          {trendDir !== 'neutral' && <TrendIcon size={11} strokeWidth={2} />}
          <span>{trendLabel ?? sub}</span>
        </div>
      )}
    </div>
  );
}

// ─── Revenue Bar Chart ─────────────────────────────────────────────────────────

function RevenueBarChart({ data }: { data: RevenuePoint[] }) {
  const last6 = data.slice(-6);
  const max = Math.max(...last6.map((d) => d.total), 1);
  return (
    <div className="flex h-44 items-end justify-between gap-3 px-2">
      {last6.map((pt, i) => {
        const pct = Math.max(4, (pt.total / max) * 100);
        return (
          <div key={i} className="group flex flex-1 flex-col items-center gap-2">
            <div className="relative flex w-full flex-col items-center">
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-outline-variant bg-white px-2 py-0.5 text-[10px] font-semibold text-on-surface opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                {moneyCompact(pt.total)}
              </div>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all duration-500 group-hover:from-indigo-700 group-hover:to-indigo-500"
                style={{ height: `${pct}%`, minHeight: '4px', maxHeight: '100%' }}
              />
            </div>
            <div className="text-[10px] font-medium text-on-surface-variant">{monthLabel(pt)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton Row ────────────────────────────────────────────────────────────

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton h-12 rounded-lg" />
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { success, error: toastError } = useToast();
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
        toastError(json?.error?.message || 'ส่งใบแจ้งหนี้ไม่สำเร็จ');
        return;
      }
      success('ส่งใบแจ้งหนี้สำเร็จแล้ว');
      setRecentInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: 'SENT' as const } : inv))
      );
    } finally {
      setSendingId(null);
    }
  }

  return (
    <main className="space-y-6">

      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-on-primary">สวัสดี, Admin</h1>
            <p className="mt-1 text-sm text-on-primary/80">{todayThai()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/billing"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 text-on-primary text-sm font-bold rounded-lg shadow-md hover:bg-white/30 transition-all"
            >
              <Plus size={14} strokeWidth={2.5} />
              นำเข้าบิล
            </Link>
            <Link href="/admin/payments/review" className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 text-on-primary text-sm font-semibold rounded-lg hover:bg-white/30 transition-all">
              <CheckSquare size={14} strokeWidth={2} />
              ตรวจสอบชำระ
            </Link>
            <Link href="/admin/invoices" className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 text-on-primary text-sm font-semibold rounded-lg hover:bg-white/30 transition-all">
              <Send size={14} strokeWidth={2} />
              ส่งใบแจ้งหนี้
            </Link>
          </div>
        </div>
      </div>

      {/* ── KPI Row — 4 cards ───────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="รายรับเดือนนี้"
          value={money(summary?.monthlyRevenue ?? 0)}
          trendDir="up"
          trendLabel="จากเดือนที่แล้ว"
          icon={DollarSign}
          loading={loading}
        />
        <KpiCard
          label="อัตราการเข้าพัก"
          value={`${occupancyRate}%`}
          trendDir={occupancyRate >= 80 ? 'up' : 'neutral'}
          trendLabel={`${occupancy?.occupiedRooms ?? 0} / ${occupancy?.totalRooms ?? 0} ห้อง`}
          icon={Home}
          loading={loading}
        />
        <KpiCard
          label="ใบแจ้งหนี้ค้างชำระ"
          value={summary?.unpaidInvoices ?? 0}
          trendDir="neutral"
          trendLabel="รอการชำระ"
          icon={FileText}
          loading={loading}
        />
        <KpiCard
          label="เกินกำหนดชำระ"
          value={summary?.overdueInvoices ?? 0}
          trendDir={(summary?.overdueInvoices ?? 0) > 0 ? 'down' : 'neutral'}
          trendLabel="ต้องติดตาม"
          icon={AlertTriangle}
          loading={loading}
        />
      </section>

      {/* ── Two-column layout ──────────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">

        {/* Left 2/3 */}
        <div className="space-y-6">

          {/* Revenue Trend */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <div className="text-sm font-bold text-primary">แนวโน้มรายรับรายเดือน</div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded">6 เดือนล่าสุด</span>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="skeleton h-44 rounded-xl" />
              ) : revenue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BarChart2 size={32} className="text-on-surface-variant mb-3" />
                  <div className="text-sm font-semibold text-on-surface-variant">ยังไม่มีข้อมูลรายรับ</div>
                  <div className="text-xs text-on-surface-variant mt-1">ข้อมูลจะแสดงเมื่อมีการสร้างบิลรายเดือน</div>
                </div>
              ) : (
                <RevenueBarChart data={revenue} />
              )}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <div className="text-sm font-bold text-primary">ใบแจ้งหนี้ล่าสุด</div>
              <Link href="/admin/invoices" className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary">
                ดูทั้งหมด <ArrowRight size={12} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <SkeletonRows count={5} />
              ) : recentInvoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText size={32} className="text-on-surface-variant mb-3" />
                  <div className="text-sm font-semibold text-on-surface-variant">ยังไม่มีใบแจ้งหนี้</div>
                  <div className="text-xs text-on-surface-variant mt-1">สร้างใบแจ้งหนี้ได้จากหน้าบิลรายเดือน</div>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-low/50">
                      <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                      <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ผู้เช่า</th>
                      <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เดือน</th>
                      <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">จำนวน</th>
                      <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
                      <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {recentInvoices.map((inv) => {
                      const badge = statusBadge(inv.status);
                      const canSend = inv.status === 'DRAFT' || inv.status === 'GENERATED';
                      const name = tenantName(inv);
                      return (
                        <tr key={inv.id} className="hover:bg-surface-container-lowest transition-colors">
                          <td className="px-6 py-4 font-mono text-xs font-semibold text-primary">{inv.room?.roomNumber ?? '—'}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(name)}`}>
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <span className="max-w-[120px] truncate text-sm text-on-surface">{name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-on-surface-variant">
                            {MONTH_ABBR[(inv.month - 1) % 12]} {inv.year}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-semibold text-on-surface">
                            {money(invoiceAmount(inv))}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                          </td>
                          <td className="px-6 py-4">
                            {canSend && (
                              <button
                                onClick={() => handleSendInvoice(inv.id)}
                                disabled={sendingId === inv.id}
                                className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary-container/20 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary-container/40 disabled:opacity-50 transition-colors"
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
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10">
              <div className="text-sm font-bold text-primary">งานวันนี้</div>
            </div>
            <div className="divide-y divide-outline-variant/10">
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <div className={`h-2 w-2 rounded-full ${unmatchedPayments.length > 0 ? 'bg-amber-400' : 'bg-surface-container'}`} />
                  <span className="text-sm text-on-surface">
                    ชำระเงินรอตรวจ
                    {unmatchedPayments.length > 0 && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                        {unmatchedPayments.length}
                      </span>
                    )}
                  </span>
                </div>
                <Link href="/admin/payments/review" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  ตรวจสอบ <ArrowRight size={11} />
                </Link>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <div className={`h-2 w-2 rounded-full ${unsentCount > 0 ? 'bg-primary' : 'bg-surface-container'}`} />
                  <span className="text-sm text-on-surface">
                    ใบแจ้งหนี้ยังไม่ส่ง
                    {unsentCount > 0 && (
                      <span className="ml-1.5 rounded-full bg-primary-container px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {unsentCount}
                      </span>
                    )}
                  </span>
                </div>
                <Link href="/admin/invoices" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  ส่ง <ArrowRight size={11} />
                </Link>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <div className={`h-2 w-2 rounded-full ${(summary?.overdueInvoices ?? 0) > 0 ? 'bg-red-400' : 'bg-surface-container'}`} />
                  <span className="text-sm text-on-surface">
                    ผู้เช่าค้างชำระ
                    {(summary?.overdueInvoices ?? 0) > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        {summary?.overdueInvoices}
                      </span>
                    )}
                  </span>
                </div>
                <Link href="/admin/overdue" className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  จัดการ <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <div className="text-sm font-bold text-primary">กิจกรรมล่าสุด</div>
              <Link href="/admin/audit-logs" className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary">
                ดูทั้งหมด <ArrowRight size={12} />
              </Link>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="skeleton h-12 rounded-lg" />)}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Clock size={24} className="text-on-surface-variant mb-2" />
                  <div className="text-xs font-semibold text-on-surface-variant">ไม่มีกิจกรรม</div>
                </div>
              ) : (
                <ol className="relative border-l-2 border-primary/20 pl-4 space-y-4">
                  {auditLogs.map((log) => (
                    <li key={log.id} className="relative">
                      <div className="absolute -left-[21px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-primary/20 bg-white">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      </div>
                      <p className="text-xs font-semibold text-on-surface leading-snug">
                        {log.action}{' '}
                        <span className="font-normal text-on-surface-variant">{log.entityType}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-on-surface-variant">
                        {log.userName} · {timeAgo(log.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Rooms At a Glance */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
              <div className="text-sm font-bold text-primary">ภาพรวมห้องพัก</div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded">{occupancy?.totalRooms ?? 0} ทั้งหมด</span>
            </div>
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm text-on-surface">เข้าพัก</span>
                </div>
                <span className="text-sm font-bold text-on-surface">{loading ? '—' : occupancy?.occupiedRooms ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-surface-container" />
                  <span className="text-sm text-on-surface">ว่าง</span>
                </div>
                <span className="text-sm font-bold text-on-surface">{loading ? '—' : occupancy?.vacantRooms ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="text-sm text-on-surface">ซ่อมบำรุง</span>
                </div>
                <span className="text-sm font-bold text-on-surface">{loading ? '—' : maintenanceCount}</span>
              </div>
              {!loading && occupancy && occupancy.totalRooms > 0 && (
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-container-high">
                  <div className="bg-emerald-500 transition-all" style={{ width: `${(occupancy.occupiedRooms / occupancy.totalRooms) * 100}%` }} />
                  <div className="bg-amber-400 transition-all" style={{ width: `${(maintenanceCount / occupancy.totalRooms) * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Bottom Section ──────────────────────────────────────── */}
      <section className="grid gap-6 xl:grid-cols-2">

        {/* Recent Conversations */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-on-surface-variant" />
              <div className="text-sm font-bold text-primary">การสนทนาล่าสุด</div>
            </div>
            <Link href="/admin/chat" className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary">
              ดูทั้งหมด <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {loading ? (
              <SkeletonRows count={3} />
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Inbox size={28} className="text-on-surface-variant mb-2" />
                <div className="text-sm font-semibold text-on-surface-variant">ไม่มีการสนทนาล่าสุด</div>
                <div className="text-xs text-on-surface-variant mt-1">ข้อความจาก LINE จะแสดงที่นี่</div>
              </div>
            ) : (
              conversations.map((conv) => {
                const name = conv.tenant?.fullName ?? 'ไม่ระบุผู้เช่า';
                return (
                  <Link
                    key={conv.id}
                    href="/admin/chat"
                    className="flex items-center justify-between px-6 py-4 hover:bg-surface-container-lowest transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold relative ${avatarColor(name)}`}>
                        {name.charAt(0).toUpperCase()}
                        {conv.unreadCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-on-surface">{name}</div>
                        <div className="text-xs text-on-surface-variant">ห้อง {conv.room?.roomNumber ?? '—'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                      <Clock size={10} />
                      {timeAgo(conv.lastMessageAt)}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Maintenance Alerts */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench size={14} className="text-on-surface-variant" />
              <div className="text-sm font-bold text-primary">แจ้งซ่อมบำรุง</div>
            </div>
            <Link href="/admin/maintenance" className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary">
              ดูทั้งหมด <ArrowRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {loading ? (
              <SkeletonRows count={3} />
            ) : openTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Wrench size={28} className="text-on-surface-variant mb-2" />
                <div className="text-sm font-semibold text-on-surface-variant">ไม่มีงานซ่อม</div>
                <div className="text-xs text-on-surface-variant mt-1">ระบบจะแสดงงานซ่อมที่ยังไม่เสร็จ</div>
              </div>
            ) : (
              openTickets
                .slice()
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map((ticket) => (
                  <div key={ticket.id} className="flex items-start justify-between gap-3 px-6 py-4 hover:bg-surface-container-lowest transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-on-surface">{ticket.title}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-on-surface-variant">
                        <span>ห้อง {ticket.room?.roomNumber ?? '—'}</span>
                        <span>·</span>
                        <Clock size={10} />
                        <span>{timeAgo(ticket.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${priorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">
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
