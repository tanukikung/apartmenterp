'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Home, AlertTriangle, DollarSign, Wrench, Receipt, ClipboardCheck, FileText, Megaphone, ArrowRight, Clock, CheckCircle2 } from 'lucide-react';
import { CountUp, MagneticCard, FadeIn, StaggerList, StaggerItem } from '@/components/motion/motion-primitives';

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

function _money(amount: number): string {
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

function todayThai(): { greeting: string; date: string } {
  const now = new Date();
  const weekday = now.toLocaleDateString('th-TH', { weekday: 'long' });
  const day = now.getDate();
  const month = now.toLocaleDateString('th-TH', { month: 'long' });
  const year = now.getFullYear() + 543;
  return {
    greeting: 'สวัสดี',
    date: `${weekday} ${day} ${month} ${year}`,
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

function _invoiceAmount(inv: Invoice): number {
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  numericValue,
  sub,
  icon: Icon,
  accent,
  href,
  prefix,
  suffix,
}: {
  label: string;
  value: string | number;
  /** When provided, the value animates from 0 via CountUp. */
  numericValue?: number;
  /** Optional formatter for numericValue (e.g. moneyCompact). */
  sub?: string;
  icon: React.ElementType;
  accent: 'green' | 'red' | 'yellow' | 'blue';
  href?: string;
  prefix?: string;
  suffix?: string;
}) {
  // Refined muted tones — all cards feel cohesive with warm premium palette.
  // Accent still carries semantic meaning but never competes with content.
  const colors = {
    green: {
      bg: 'bg-color-surface',
      border: 'border-color-border',
      icon: 'bg-[hsl(150,28%,92%)] text-[hsl(150,36%,32%)] dark:bg-[hsl(150,30%,18%)] dark:text-[hsl(150,30%,72%)]',
      text: 'text-[hsl(150,36%,32%)] dark:text-[hsl(150,30%,72%)]',
      glow: 'hover:shadow-md',
    },
    red: {
      bg: 'bg-color-surface',
      border: 'border-color-border',
      icon: 'bg-[hsl(12,50%,93%)] text-[hsl(8,48%,42%)] dark:bg-[hsl(8,35%,18%)] dark:text-[hsl(8,50%,78%)]',
      text: 'text-[hsl(8,48%,42%)] dark:text-[hsl(8,50%,78%)]',
      glow: 'hover:shadow-md',
    },
    yellow: {
      bg: 'bg-color-surface',
      border: 'border-color-border',
      icon: 'bg-[hsl(38,55%,92%)] text-[hsl(32,50%,36%)] dark:bg-[hsl(32,35%,18%)] dark:text-[hsl(38,55%,75%)]',
      text: 'text-[hsl(32,50%,36%)] dark:text-[hsl(38,55%,75%)]',
      glow: 'hover:shadow-md',
    },
    blue: {
      bg: 'bg-color-surface',
      border: 'border-color-border',
      icon: 'bg-[hsl(160,28%,92%)] text-[hsl(165,42%,20%)] dark:bg-[hsl(165,32%,16%)] dark:text-[hsl(160,30%,72%)]',
      text: 'text-[hsl(165,42%,20%)] dark:text-[hsl(160,30%,72%)]',
      glow: 'hover:shadow-md',
    },
  }[accent];

  const card = (
    <MagneticCard tilt={3} lift={3} magnet={0.1} className="h-full">
      <div
        className={`group relative h-full ${colors.bg} ${colors.border} border rounded-xl p-5 transition-all duration-300 hover:border-color-border-strong ${colors.glow} overflow-hidden`}
      >
        {/* Subtle warm highlight */}
        <div className="absolute inset-0 bg-[radial-gradient(140%_70%_at_50%_0%,hsl(38_30%_94%/0.5),transparent_65%)] dark:bg-[radial-gradient(140%_70%_at_50%_0%,hsl(30_20%_16%/0.4),transparent_65%)] pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between gap-2 mb-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-on-surface-variant">{label}</span>
            <motion.div
              whileHover={{ rotate: -6, scale: 1.08 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className={`h-10 w-10 rounded-xl flex items-center justify-center shadow-lg ring-1 ring-white/20 ${colors.icon}`}
            >
              <Icon size={18} strokeWidth={2} />
            </motion.div>
          </div>
          <div className={`text-3xl font-extrabold tracking-tight ${colors.text} leading-none mb-1 tabular-nums`}>
            {numericValue !== undefined ? (
              <CountUp value={numericValue} prefix={prefix} suffix={suffix} duration={1.1} />
            ) : (
              <>{value}</>
            )}
          </div>
          {sub && <div className="text-xs text-on-surface-variant mt-1.5">{sub}</div>}
        </div>
      </div>
    </MagneticCard>
  );

  if (href) {
    return <Link href={href} className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl">{card}</Link>;
  }
  return card;
}

// ─── Action Button ────────────────────────────────────────────────────────────

function ActionButton({
  label,
  icon: Icon,
  color,
  href,
}: {
  label: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'red';
  href: string;
}) {
  const colors = {
    blue: 'bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 text-white shadow-blue-500/40',
    green: 'bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 text-white shadow-emerald-500/40',
    red: 'bg-gradient-to-br from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-red-500/40',
  }[color];

  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      <Link
        href={href}
        className={`group relative flex flex-col items-center justify-center gap-2 rounded-2xl py-5 px-6 font-bold text-sm shadow-lg transition-shadow duration-200 hover:shadow-xl ring-1 ring-white/10 overflow-hidden ${colors}`}
      >
        {/* Shine sweep on hover */}
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
        <Icon size={24} strokeWidth={2} className="relative z-10 drop-shadow" />
        <span className="relative z-10 tracking-tight">{label}</span>
      </Link>
    </motion.div>
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
    green: { bg: 'bg-surface-container-lowest', border: 'border-emerald-200 dark:border-emerald-500/30', header: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', count: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200', icon: 'text-emerald-500 dark:text-emerald-400' },
    red: { bg: 'bg-surface-container-lowest', border: 'border-red-200 dark:border-red-500/30', header: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300', count: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200', icon: 'text-red-500 dark:text-red-400' },
    yellow: { bg: 'bg-surface-container-lowest', border: 'border-amber-200 dark:border-amber-500/30', header: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', count: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200', icon: 'text-amber-500 dark:text-amber-400' },
    blue: { bg: 'bg-surface-container-lowest', border: 'border-blue-200 dark:border-blue-500/30', header: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300', count: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200', icon: 'text-blue-500 dark:text-blue-400' },
  }[accent];

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}>
      <div className={`px-4 py-3 border-b border-outline-variant/30 flex items-center justify-between`}>
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

      <div className="p-4">
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
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                accent === 'green'
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
                  : accent === 'red'
                  ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20'
                  : accent === 'yellow'
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20'
              }`}
            >
              {actionLabel} <ArrowRight size={10} />
            </Link>
          )}
          {secondaryActionLabel && secondaryActionHref && (
            <Link
              href={secondaryActionHref}
              className="inline-flex items-center gap-1 rounded-lg border border-outline px-3 py-1.5 text-xs font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              {secondaryActionLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
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

  const urgentCount = (summary?.overdueInvoices ?? 0) + pendingMaintenanceCount + expiringContracts.length;

  return (
    <div className="space-y-8">
      {/* ── Premium Header ─────────────────────────────────────── */}
      <FadeIn y={4} className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-color-text-3 mb-2">
            {date}
          </div>
          <h1 className="font-serif text-[32px] sm:text-[40px] leading-[1.1] text-color-text">
            {greeting}, ยินดีต้อนรับ
          </h1>
          <p className="mt-2 text-[14px] text-color-text-2 max-w-xl">
            {urgentCount > 0
              ? `มี ${urgentCount} รายการที่ต้องการความสนใจของคุณวันนี้`
              : 'ทุกอย่างเรียบร้อยดี ไม่มีรายการค้างในวันนี้'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/invoices"
            className="inline-flex items-center gap-1.5 rounded-lg border border-color-border bg-color-surface px-3.5 py-2 text-[13px] font-medium text-color-text hover:border-color-border-strong transition-colors"
          >
            ใบแจ้งหนี้ <ArrowRight size={14} />
          </Link>
          <Link
            href="/admin/payments"
            className="inline-flex items-center gap-1.5 rounded-lg bg-color-primary px-3.5 py-2 text-[13px] font-medium text-white shadow-sm hover:bg-color-primary-dark transition-colors"
          >
            ตรวจชำระเงิน <ArrowRight size={14} />
          </Link>
        </div>
      </FadeIn>

      <div className="space-y-6">

        {/* ── KPI Row ─────────────────────────────────────────────── */}
        <StaggerList stagger={0.07} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <>
              <SkeletonCard className="h-32" />
              <SkeletonCard className="h-32" />
              <SkeletonCard className="h-32" />
              <SkeletonCard className="h-32" />
            </>
          ) : (
            <>
              <StaggerItem>
                <KpiCard
                  label="ห้องว่าง"
                  numericValue={occupancy?.vacantRooms ?? 0}
                  value={occupancy?.vacantRooms ?? 0}
                  sub={`จาก ${occupancy?.totalRooms ?? 0} ห้อง`}
                  icon={Home}
                  accent="green"
                  href="/admin/rooms"
                />
              </StaggerItem>
              <StaggerItem>
                <KpiCard
                  label="ค้างชำระ"
                  numericValue={summary?.overdueInvoices ?? 0}
                  value={summary?.overdueInvoices ?? 0}
                  sub="เกินกำหนดชำระ"
                  icon={AlertTriangle}
                  accent="red"
                  href="/admin/overdue"
                />
              </StaggerItem>
              <StaggerItem>
                <KpiCard
                  label="รายได้เดือนนี้"
                  value={moneyCompact(summary?.monthlyRevenue ?? 0)}
                  sub="รายรับรวม"
                  icon={DollarSign}
                  accent="blue"
                />
              </StaggerItem>
              <StaggerItem>
                <KpiCard
                  label="แจ้งซ่อมรอดำเนินการ"
                  numericValue={pendingMaintenanceCount}
                  value={pendingMaintenanceCount}
                  sub={`${pendingMaintenanceCount} รายการ`}
                  icon={Wrench}
                  accent="yellow"
                  href="/admin/maintenance"
                />
              </StaggerItem>
            </>
          )}
        </StaggerList>

        {/* ── 3 Big Action Buttons ────────────────────────────────── */}
        <StaggerList stagger={0.08} delay={0.15} className="grid grid-cols-3 gap-4">
          <StaggerItem>
            <ActionButton
              label="ตรวจสลิป"
              icon={ClipboardCheck}
              color="blue"
              href="/admin/payments/review"
            />
          </StaggerItem>
          <StaggerItem>
            <ActionButton
              label="วางบิล"
              icon={Receipt}
              color="green"
              href="/admin/billing"
            />
          </StaggerItem>
          <StaggerItem>
            <ActionButton
              label="ดูค้างชำระ"
              icon={FileText}
              color="red"
              href="/admin/overdue"
            />
          </StaggerItem>
        </StaggerList>

        {/* ── Task Cards + Recent Activity ─────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Task Cards Grid */}
          <StaggerList stagger={0.06} delay={0.25} className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* รอตรวจสลิป */}
            <StaggerItem>
              <TaskCard
                title="รอตรวจสลิป"
                count={unmatchedPayments}
                icon={ClipboardCheck}
                accent="blue"
                actionLabel="ตรวจเลย"
                actionHref="/admin/payments/review"
              />
            </StaggerItem>

            {/* ค้างชำระ 3+ วัน */}
            <StaggerItem>
              <TaskCard
                title="ค้างชำระ"
                count={overdueCount}
                icon={AlertTriangle}
                accent="red"
                items={overdueItems}
                actionLabel="ดูทั้งหมด"
                actionHref="/admin/overdue"
              />
            </StaggerItem>

            {/* แจ้งซ่อมใหม่ */}
            <StaggerItem>
              <TaskCard
                title="แจ้งซ่อมใหม่"
                count={pendingMaintenanceCount}
                icon={Wrench}
                accent="yellow"
                items={maintenanceItems}
                actionLabel="ดู"
                actionHref="/admin/maintenance"
              />
            </StaggerItem>

            {/* สัญญาใกล้หมด */}
            <StaggerItem>
              <TaskCard
                title="สัญญาใกล้หมด"
                count={expiringContracts.length}
                icon={FileText}
                accent="yellow"
                items={contractItems}
                actionLabel="ต่อสัญญา"
                actionHref="/admin/contracts"
              />
            </StaggerItem>

            {/* ประกาศ */}
            <StaggerItem>
              <TaskCard
                title="ประกาศ"
                icon={Megaphone}
                accent="blue"
                actionLabel="ส่งประกาศ"
                actionHref="/admin/broadcast"
              />
            </StaggerItem>

          </StaggerList>

          {/* Right: Recent Activity */}
          <FadeIn delay={0.4} className="glass-card rounded-2xl overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-2">
                <span className="pulse-dot" />
                <Clock size={14} className="text-on-surface-variant" />
                <span className="text-sm font-bold text-on-surface">กิจกรรมล่าสุด</span>
              </div>
              <Link
                href="/admin/audit-logs"
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors group"
              >
                ดูทั้งหมด
                <ArrowRight size={10} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="shimmer-wave h-10 rounded-lg"
                      style={{ animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  >
                    <CheckCircle2 size={32} className="text-emerald-400 mb-2" />
                  </motion.div>
                  <p className="text-sm font-medium text-on-surface-variant">ไม่มีกิจกรรมล่าสุด</p>
                </div>
              ) : (
                <StaggerList stagger={0.04} className="divide-y divide-outline-variant/20">
                  {auditLogs.map((log) => (
                    <StaggerItem key={log.id}>
                      <ActivityItem log={log} />
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
            </div>
          </FadeIn>

        </section>

      </div>
    </div>
  );
}
