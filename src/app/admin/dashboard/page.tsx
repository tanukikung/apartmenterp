'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Home,
  AlertTriangle,
  DollarSign,
  Wrench,
  Receipt,
  ClipboardCheck,
  FileText,
  Megaphone,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenanceRooms: number;
};

type SummaryData = {
  monthlyRevenue: number;
  unpaidInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
};

type MaintenanceTicket = {
  id: string;
  title: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'DONE' | 'CLOSED';
  room?: { roomNumber?: string; roomNo?: string } | null;
  createdAt: string;
};

type Invoice = {
  id: string;
  year: number;
  month: number;
  status: string;
  totalAmount?: number;
  total?: number;
  room?: { roomNumber?: string; roomNo?: string } | null;
  tenant?: { fullName?: string | null } | null;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  userName: string;
  createdAt: string;
};

type ExpiringContract = {
  id: string;
  roomNo: string;
  tenantName: string;
  endDate: string;
  daysLeft: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const dashboardDateFormatter = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
});

function todayThai(): { greeting: string; date: string } {
  const now = new Date();
  return {
    greeting: 'สวัสดี',
    date: dashboardDateFormatter.format(now),
  };
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

function invoiceAmount(inv: Invoice): number {
  return inv.totalAmount ?? inv.total ?? 0;
}

const MONTH_ABBR = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const AUDIT_LABELS: Record<string, string> = {
  PAYMENT_CONFIRMED: 'ยืนยันชำระเงิน',
  PAYMENT_REJECTED: 'ปฏิเสธชำระเงิน',
  PAYMENT_IMPORTED: 'นำเข้าชำระเงิน',
  INVOICE_GENERATED: 'สร้างใบแจ้งหนี้',
  INVOICE_REGENERATED: 'สร้างใบแจ้งหนี้ใหม่',
  INVOICE_CANCELLED: 'ยกเลิกใบแจ้งหนี้',
  INVOICE_SEND_REQUESTED: 'ส่งใบแจ้งหนี้',
  CHAT_MESSAGE_SENT: 'ส่งข้อความ LINE',
  MAINTENANCE_TICKET_CREATED: 'สร้างงานซ่อม',
  MAINTENANCE_TICKET_CLOSED: 'ปิดงานซ่อม',
  MAINTENANCE_STATUS_UPDATED: 'อัปเดตสถานะซ่อม',
  ADMIN_USER_CREATED: 'สร้างผู้ดูแล',
  ADMIN_USER_UPDATED: 'แก้ไขผู้ดูแล',
  TENANT_REGISTRATION_APPROVED: 'อนุมัติลงทะเบียน',
  TENANT_REGISTRATION_REJECTED: 'ปฏิเสธลงทะเบียน',
  BANK_STATEMENT_UPLOADED: 'อัปโหลด Statement',
  BUILDING_SETTINGS_UPDATED: 'แก้ไขตั้งค่าอาคาร',
  CONTRACT_RENEWED: 'ต่อสัญญา',
  CONTRACT_TERMINATED: 'ยกเลิกสัญญา',
};

function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}

function riseIn(delay = 0) {
  return {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] as const, delay },
  };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: 'green' | 'red' | 'yellow' | 'blue';
  href?: string;
}) {
  const colors = {
    green: { border: 'border-emerald-200/80', glow: 'from-emerald-100/90 via-white to-emerald-50/80', icon: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', sub: 'text-emerald-900/70' },
    red: { border: 'border-rose-200/80', glow: 'from-rose-100/90 via-white to-rose-50/80', icon: 'bg-rose-100 text-rose-700', text: 'text-rose-700', sub: 'text-rose-900/70' },
    yellow: { border: 'border-amber-200/80', glow: 'from-amber-100/90 via-white to-amber-50/80', icon: 'bg-amber-100 text-amber-700', text: 'text-amber-700', sub: 'text-amber-900/70' },
    blue: { border: 'border-sky-200/80', glow: 'from-sky-100/90 via-white to-indigo-50/80', icon: 'bg-sky-100 text-sky-700', text: 'text-sky-700', sub: 'text-slate-900/70' },
  }[accent];

  const card = (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      className={`premium-surface group relative overflow-hidden rounded-[28px] border p-5 ${colors.border}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br ${colors.glow} opacity-90`} />
      <div className="relative flex items-start justify-between gap-2 mb-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">{label}</span>
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm ${colors.icon}`}>
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>
      <div className={`relative text-[2rem] font-extrabold leading-none tracking-[-0.05em] ${colors.text} mb-1`}>{value}</div>
      {sub && <div className={`relative mt-2 text-xs ${colors.sub}`}>{sub}</div>}
    </motion.div>
  );

  if (href) {
    return <Link href={href} className="block">{card}</Link>;
  }
  return card;
}

// ─── Action Button ────────────────────────────────────────────────────────────

function ActionButton({
  label,
  description,
  icon: Icon,
  color,
  href,
}: {
  label: string;
  description?: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'red';
  href: string;
}) {
  const colors = {
    blue: {
      container: 'border-indigo-200/80 bg-[linear-gradient(160deg,rgba(238,242,255,0.96),rgba(224,231,255,0.82))] text-indigo-950',
      icon: 'bg-white text-indigo-700 ring-1 ring-indigo-100 shadow-sm',
      sub: 'text-indigo-800/75',
      arrow: 'text-indigo-700/80',
    },
    green: {
      container: 'border-emerald-200/80 bg-[linear-gradient(160deg,rgba(236,253,245,0.96),rgba(209,250,229,0.82))] text-emerald-950',
      icon: 'bg-white text-emerald-700 ring-1 ring-emerald-100 shadow-sm',
      sub: 'text-emerald-800/75',
      arrow: 'text-emerald-700/75',
    },
    red: {
      container: 'border-rose-200/80 bg-[linear-gradient(160deg,rgba(255,241,242,0.96),rgba(255,228,230,0.82))] text-rose-950',
      icon: 'bg-white text-rose-700 ring-1 ring-rose-100 shadow-sm',
      sub: 'text-rose-800/75',
      arrow: 'text-rose-700/75',
    },
  }[color];

  return (
    <Link
      href={href}
      className={`pressable group flex min-h-[132px] flex-col justify-between rounded-[28px] border px-5 py-5 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-md)] ${colors.container}`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.icon}`}>
        <Icon size={20} strokeWidth={2.1} />
      </div>
      <div className="space-y-1">
        <div className="text-sm font-bold">{label}</div>
        {description ? <div className={`text-xs ${colors.sub}`}>{description}</div> : null}
      </div>
      <div className={`ml-auto flex items-center gap-1 text-xs font-semibold ${colors.arrow}`}>
        เปิด
        <ArrowRight size={12} className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────────────

function TaskCard({
  title,
  count,
  sub,
  actionLabel,
  actionHref,
  secondaryActionLabel,
  secondaryActionHref,
  items,
  accent,
  icon: Icon,
}: {
  title: string;
  count?: number;
  sub?: string;
  actionLabel?: string;
  actionHref?: string;
  secondaryActionLabel?: string;
  secondaryActionHref?: string;
  items?: { label: string; sub?: string }[];
  accent: 'green' | 'red' | 'yellow' | 'blue';
  icon: React.ElementType;
}) {
  const colors = {
    green: { border: 'border-emerald-200/80', wash: 'from-emerald-50 via-white to-white', count: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-500' },
    red: { border: 'border-rose-200/80', wash: 'from-rose-50 via-white to-white', count: 'bg-rose-100 text-rose-700', icon: 'text-rose-500' },
    yellow: { border: 'border-amber-200/80', wash: 'from-amber-50 via-white to-white', count: 'bg-amber-100 text-amber-700', icon: 'text-amber-500' },
    blue: { border: 'border-sky-200/80', wash: 'from-sky-50 via-white to-white', count: 'bg-sky-100 text-sky-700', icon: 'text-sky-500' },
  }[accent];

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.005 }}
      className={`premium-surface relative overflow-hidden rounded-[28px] border ${colors.border}`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br ${colors.wash} opacity-95`} />
      <div className="relative flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon size={14} className={colors.icon} />
          <span className="text-sm font-bold text-on-surface">{title}</span>
        </div>
        {count !== undefined && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${colors.count}`}>
            {count}
          </span>
        )}
      </div>

      <div className="relative p-5">
        {items && items.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {items.slice(0, 3).map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-on-surface-variant">
                <div className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                <span className="font-medium text-on-surface">{item.label}</span>
                {item.sub && <span>{item.sub}</span>}
              </li>
            ))}
            {items.length > 3 && (
              <li className="text-xs text-on-surface-variant pl-3.5">+{items.length - 3} รายการ</li>
            )}
          </ul>
        )}

        {sub && !items && <p className="text-xs text-on-surface-variant mb-3">{sub}</p>}

        <div className="flex items-center gap-2">
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className={`pressable inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                accent === 'green'
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : accent === 'red'
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : accent === 'yellow'
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              {actionLabel} <ArrowRight size={10} />
            </Link>
          )}
          {secondaryActionLabel && secondaryActionHref && (
            <Link
              href={secondaryActionHref}
              className="pressable inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-slate-50 transition-colors"
            >
              {secondaryActionLabel}
            </Link>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Recent Activity Item ─────────────────────────────────────────────────────

function ActivityItem({ log }: { log: AuditRow }) {
  const isPositive = ['PAYMENT_CONFIRMED', 'INVOICE_SEND_REQUESTED', 'MAINTENANCE_TICKET_CLOSED', 'TENANT_REGISTRATION_APPROVED', 'CONTRACT_RENEWED'].includes(log.action);
  const isNegative = ['PAYMENT_REJECTED', 'INVOICE_CANCELLED', 'TENANT_REGISTRATION_REJECTED', 'CONTRACT_TERMINATED'].includes(log.action);
  const dotColor = isPositive ? 'bg-emerald-400' : isNegative ? 'bg-red-400' : 'bg-blue-400';

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-on-surface leading-snug">
          {auditLabel(log.action)}
          <span className="font-normal text-on-surface-variant ml-1">{log.entityType}</span>
        </p>
        <p className="text-[10px] text-on-surface-variant mt-0.5">{log.userName} · {timeAgo(log.createdAt)}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [pendingMaintenance, setPendingMaintenance] = useState<MaintenanceTicket[]>([]);
  const [pendingMaintenanceCount, setPendingMaintenanceCount] = useState(0);
  const [unmatchedPayments, setUnmatchedPayments] = useState(0);
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [expiringContracts, setExpiringContracts] = useState<ExpiringContract[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { greeting, date } = todayThai();
  const occupancyRate = occupancy?.totalRooms ? Math.round((occupancy.occupiedRooms / occupancy.totalRooms) * 100) : 0;

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
          occupancyRes,
          summaryRes,
          maintenanceRes,
          unmatchedRes,
          overdueRes,
          alertsRes,
          auditRes,
        ] = await Promise.all([
          safe('/api/analytics/occupancy'),
          safe('/api/analytics/summary'),
          safe('/api/admin/maintenance?status=OPEN&pageSize=5'),
          safe('/api/payments/review?limit=1'),
          safe('/api/invoices?status=OVERDUE&pageSize=5'),
          safe('/api/admin/dashboard-alerts'),
          safe('/api/audit-logs?limit=10'),
        ]);

        if (occupancyRes?.success) setOccupancy(occupancyRes.data);
        if (summaryRes?.success) setSummary(summaryRes.data);

        if (maintenanceRes?.success) {
          const data = maintenanceRes.data;
          const tickets: MaintenanceTicket[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          const total: number = data?.total ?? tickets.length;
          setPendingMaintenance(tickets.slice(0, 5));
          setPendingMaintenanceCount(total);
        }

        if (unmatchedRes?.success) {
          const raw = unmatchedRes.data;
          const total: number = raw?.total ?? (Array.isArray(raw?.transactions) ? raw.transactions.length : 0);
          setUnmatchedPayments(total);
        } else {
          // Fallback: count from dashboard alerts
          const alerts = alertsRes?.data?.alerts ?? [];
          const unmatched = alerts.find((a: { type: string }) => a.type === 'unmatched_payments');
          if (unmatched) setUnmatchedPayments(unmatched.count);
        }

        if (overdueRes?.success) {
          const raw = overdueRes.data;
          const list: Invoice[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
          const total: number = raw?.total ?? list.length;
          setOverdueInvoices(list);
          setOverdueCount(total);
        }

        if (alertsRes?.success) {
          const alerts = alertsRes.data?.alerts ?? [];
          const expiring = alerts.filter((a: { type: string }) => a.type === 'contract_expiring');
          if (expiring.length > 0) {
            setExpiringContracts(
              alertsRes.data?.expiringContracts?.slice(0, 5).map((c: ExpiringContract) => ({
                ...c,
                roomNo: c.roomNo,
                tenantName: c.tenantName,
              })) ?? []
            );
          }
        }

        if (auditRes?.success) {
          const raw = auditRes.data;
          const logs: AuditRow[] = Array.isArray(raw?.rows) ? raw.rows : Array.isArray(raw) ? raw : [];
          setAuditLogs(logs.slice(0, 10));
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Derive overdue 3+ days items (use due date comparison)
  const overdueItems = overdueInvoices.slice(0, 3).map((inv) => ({
    label: `${inv.room?.roomNumber ?? inv.room?.roomNo ?? '?'} — ${inv.tenant?.fullName ?? 'ไม่ระบุ'}`,
    sub: MONTH_ABBR[(inv.month - 1) % 12] + ' ' + inv.year,
  }));

  const maintenanceItems = pendingMaintenance.slice(0, 3).map((t) => ({
    label: t.title,
    sub: `ห้อง ${t.room?.roomNumber ?? t.room?.roomNo ?? '?'}`,
  }));

  const contractItems = expiringContracts.slice(0, 3).map((c) => ({
    label: `ห้อง ${c.roomNo} — ${c.tenantName}`,
    sub: `${c.daysLeft} วัน`,
  }));

  return (
    <main className="mx-auto w-full max-w-[1380px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <motion.section
          {...riseIn(0)}
          className="premium-surface relative overflow-hidden rounded-[36px] px-6 py-6 sm:px-8 sm:py-7"
        >
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[42%] bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.18),transparent_58%)]" />
          <div className="pointer-events-none absolute -left-16 top-6 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.16),transparent_68%)] blur-2xl" />

          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:items-center">
            <div className="space-y-5">
              <span className="section-kicker">Daily Control Room</span>
              <div className="space-y-2">
                <h1 className="text-3xl font-extrabold tracking-[-0.05em] text-on-surface sm:text-[2.45rem]">
                  {greeting} วันนี้
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-on-surface-variant sm:text-[0.95rem]">
                  ภาพรวมงานสำคัญของอาคารในวันนี้ ทั้งห้องพัก รายได้ ค้างชำระ และงานที่ทีมต้องติดตามต่อทันที
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5 text-sm">
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700">
                  {date}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700">
                  อัตราเข้าพัก {occupancyRate}%
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">
                  ห้องว่าง {occupancy?.vacantRooms ?? 0}
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-700">
                  งานซ่อมรอทำ {pendingMaintenanceCount}
                </span>
              </div>
            </div>

            <div className="premium-surface-muted rounded-[30px] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">สถานะวันนี้</div>
                  <div className="mt-1 text-lg font-bold tracking-tight text-on-surface">อาคารกำลังดำเนินงานปกติ</div>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(99,102,241,0.96),rgba(34,211,238,0.72))] text-white shadow-[var(--shadow-indigo)]">
                  <CheckCircle2 size={18} strokeWidth={2.2} />
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm font-medium text-on-surface">
                    <span>อัตราเข้าพัก</span>
                    <span>{occupancyRate}%</span>
                  </div>
                  <div className="mt-2 h-2.5 rounded-full bg-slate-200/80">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,rgba(99,102,241,0.96),rgba(34,211,238,0.82))]"
                      style={{ width: `${Math.max(occupancyRate, 6)}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">ใบแจ้งหนี้ชำระแล้ว</div>
                    <div className="mt-2 text-2xl font-extrabold tracking-[-0.05em] text-emerald-700">{summary?.paidInvoices ?? 0}</div>
                  </div>
                  <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">รอจัดการ</div>
                    <div className="mt-2 text-2xl font-extrabold tracking-[-0.05em] text-slate-800">{summary?.unpaidInvoices ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section {...riseIn(0.05)} className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {loading ? (
            <>
              <SkeletonCard className="h-32 rounded-[28px]" />
              <SkeletonCard className="h-32 rounded-[28px]" />
              <SkeletonCard className="h-32 rounded-[28px]" />
              <SkeletonCard className="h-32 rounded-[28px]" />
            </>
          ) : (
            <>
              <KpiCard
                label="ห้องว่าง"
                value={occupancy?.vacantRooms ?? 0}
                sub={`จาก ${occupancy?.totalRooms ?? 0} ห้อง`}
                icon={Home}
                accent="green"
                href="/admin/rooms"
              />
              <KpiCard
                label="ค้างชำระ"
                value={summary?.overdueInvoices ?? 0}
                sub="เกินกำหนดชำระ"
                icon={AlertTriangle}
                accent="red"
                href="/admin/overdue"
              />
              <KpiCard
                label="รายได้เดือนนี้"
                value={moneyCompact(summary?.monthlyRevenue ?? 0)}
                sub="รายรับรวม"
                icon={DollarSign}
                accent="blue"
              />
              <KpiCard
                label="แจ้งซ่อมรอดำเนินการ"
                value={pendingMaintenanceCount}
                sub={`${pendingMaintenanceCount} รายการ`}
                icon={Wrench}
                accent="yellow"
                href="/admin/maintenance"
              />
            </>
          )}
        </motion.section>

        <motion.section {...riseIn(0.1)} className="premium-surface rounded-[32px] p-5 sm:p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-bold text-on-surface">งานด่วนประจำวัน</h2>
              <p className="text-xs text-on-surface-variant">ทางลัดสำหรับงานที่ทีมใช้งานบ่อยที่สุดในรอบปฏิบัติการประจำวัน</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <ActionButton
              label="ตรวจสลิป"
              description="เปิดรายการรอจับคู่และตรวจสอบการโอนล่าสุด"
              icon={ClipboardCheck}
              color="blue"
              href="/admin/payments/review"
            />
            <ActionButton
              label="วางบิล"
              description="เข้าสู่รอบบิลและจัดการชุดข้อมูลก่อนออกใบแจ้งหนี้"
              icon={Receipt}
              color="green"
              href="/admin/billing"
            />
            <ActionButton
              label="ดูค้างชำระ"
              description="ติดตามยอดเกินกำหนดและเตรียมส่งเตือนผู้เช่า"
              icon={FileText}
              color="red"
              href="/admin/overdue"
            />
          </div>
        </motion.section>

        <motion.section {...riseIn(0.15)} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
            <TaskCard
              title="รอตรวจสลิป"
              count={unmatchedPayments}
              icon={ClipboardCheck}
              accent="blue"
              actionLabel="ตรวจเลย"
              actionHref="/admin/payments/review"
            />

            <TaskCard
              title="ค้างชำระ"
              count={overdueCount}
              icon={AlertTriangle}
              accent="red"
              items={overdueItems}
              actionLabel="ดูทั้งหมด"
              actionHref="/admin/overdue"
            />

            <TaskCard
              title="แจ้งซ่อมใหม่"
              count={pendingMaintenanceCount}
              icon={Wrench}
              accent="yellow"
              items={maintenanceItems}
              actionLabel="ดู"
              actionHref="/admin/maintenance"
            />

            <TaskCard
              title="สัญญาใกล้หมด"
              count={expiringContracts.length}
              icon={FileText}
              accent="yellow"
              items={contractItems}
              actionLabel="ต่อสัญญา"
              actionHref="/admin/contracts"
            />

            <TaskCard
              title="ประกาศ"
              icon={Megaphone}
              accent="blue"
              sub="เตรียมประกาศข่าวสารหรือแจ้งเตือนลูกบ้านจากศูนย์ประกาศได้ทันที"
              actionLabel="ส่งประกาศ"
              actionHref="/admin/broadcast"
            />
          </div>

          <div className="premium-surface overflow-hidden rounded-[30px]">
            <div className="flex items-center justify-between border-b border-outline-variant/10 px-5 py-4">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-[var(--color-text-3)]" />
                <span className="text-sm font-bold text-on-surface">กิจกรรมล่าสุด</span>
              </div>
              <Link
                href="/admin/audit-logs"
                className="pressable flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-slate-50"
              >
                ดูทั้งหมด <ArrowRight size={10} />
              </Link>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="skeleton h-12 rounded-2xl" />
                  ))}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 size={28} className="mb-2 text-slate-300" />
                  <p className="text-sm font-medium text-slate-400">ไม่มีกิจกรรมล่าสุด</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <ActivityItem key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
