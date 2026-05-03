'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Home, AlertTriangle, DollarSign, Wrench, Receipt, ClipboardCheck, FileText, Megaphone, ArrowRight, Clock, CheckCircle2 } from 'lucide-react';
import { CountUp, FadeIn, StaggerList, StaggerItem } from '@/components/motion/motion-primitives';

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

// ─── Glass KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  numericValue,
  sub,
  subValue,
  icon: Icon,
  accent,
  href,
  prefix,
  suffix,
}: {
  label: string;
  value: string | number;
  numericValue?: number;
  sub?: string;
  subValue?: string;
  icon: React.ElementType;
  accent: 'green' | 'red' | 'yellow' | 'blue';
  href?: string;
  prefix?: string;
  suffix?: string;
}) {
  const colors = {
    green: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      icon: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 text-emerald-600',
      text: 'text-emerald-600',
      glow: 'hover:shadow-[0_0_24px_rgba(16,140,80,0.12)]',
    },
    red: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/20 hover:border-red-500/40',
      icon: 'bg-gradient-to-br from-red-500/20 to-red-500/10 text-red-600',
      text: 'text-red-600',
      glow: 'hover:shadow-[0_0_24px_rgba(200,50,50,0.12)]',
    },
    yellow: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20 hover:border-amber-500/40',
      icon: 'bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-600',
      text: 'text-amber-600',
      glow: 'hover:shadow-[0_0_24px_rgba(200,140,16,0.12)]',
    },
    blue: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20 hover:border-blue-500/40',
      icon: 'bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-blue-600',
      text: 'text-blue-600',
      glow: 'hover:shadow-[0_0_24px_rgba(37,99,235,0.12)]',
    },
  }[accent];

  const card = (
    <div
      className={`group relative h-full rounded-2xl border bg-[hsl(var(--color-surface))] shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${colors.border} p-5 transition-all duration-300 ${colors.glow} overflow-hidden cursor-pointer active:scale-[0.98]`}
    >
      {/* Glass inner glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(var(--color-surface)/0.03)] to-transparent pointer-events-none" />
      <div className="relative">
        <div className="flex items-start justify-between gap-2 mb-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--on-surface-variant))]">{label}</span>
          <motion.div
            whileHover={{ rotate: -6, scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className={`h-10 w-10 rounded-xl flex items-center justify-center border-[hsl(var(--color-border))] ${colors.icon}`}
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
        {sub && <div className="text-xs text-[hsl(var(--on-surface-variant))] mt-1.5 opacity-70">{sub}</div>}
        {subValue && <div className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5 opacity-50">{subValue}</div>}
      </div>
    </div>
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
    blue: 'bg-blue-700 hover:bg-blue-600 text-white shadow-[0_4px_16px_rgba(59,130,246,0.3)] border-blue-500/30',
    green: 'bg-teal-700 hover:bg-teal-600 text-white shadow-[0_4px_16px_rgba(34,197,94,0.3)] border-emerald-500/30',
    red: 'bg-red-700 hover:bg-red-600 text-white shadow-[0_4px_16px_rgba(239,68,68,0.3)] border-red-500/30',
  }[color];

  const iconColors = {
    blue: 'text-white',
    green: 'text-white',
    red: 'text-white',
  }[color];

  const labelColors = {
    blue: 'text-white',
    green: 'text-white',
    red: 'text-white',
  }[color];

  return (
    <motion.div
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      <Link
        href={href}
        className={`group relative flex flex-col items-center justify-center gap-2 rounded-2xl py-5 px-6 font-bold text-sm border transition-all duration-200 hover:shadow-xl overflow-hidden ${colors}`}
      >
        {/* Shine sweep on hover */}
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-[hsl(var(--color-surface)/0.2) to-transparent pointer-events-none" />
        <Icon size={24} strokeWidth={2} className={`relative z-10 drop-shadow ${iconColors}`} />
        <span className={`relative z-10 tracking-tight drop-shadow-sm ${labelColors}`}>{label}</span>
      </Link>
    </motion.div>
  );
}

// ─── Task Card (Dark Glass) ───────────────────────────────────────────────────

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
    green: { bg: 'bg-[hsl(var(--color-surface))]', border: 'border-[hsl(var(--color-border))] hover:border-emerald-500/40', header: 'text-emerald-600', count: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30', icon: 'text-emerald-600' },
    red: { bg: 'bg-[hsl(var(--color-surface))]', border: 'border-[hsl(var(--color-border))] hover:border-red-500/40', header: 'text-red-600', count: 'bg-red-500/15 text-red-600 border border-red-500/30', icon: 'text-red-600' },
    yellow: { bg: 'bg-[hsl(var(--color-surface))]', border: 'border-[hsl(var(--color-border))] hover:border-amber-500/40', header: 'text-amber-600', count: 'bg-amber-500/15 text-amber-600 border border-amber-500/30', icon: 'text-amber-600' },
    blue: { bg: 'bg-[hsl(var(--color-surface))]', border: 'border-[hsl(var(--color-border))] hover:border-blue-500/40', header: 'text-blue-600', count: 'bg-blue-500/15 text-blue-600 border border-blue-500/30', icon: 'text-blue-600' },
  }[accent];

  return (
    <div className={`${colors.bg} ${colors.border} border rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden hover:shadow-[0_4px_20px_rgba(0,0,0,0.14)] transition-all duration-200`}>
      <div className={`px-4 py-3 border-b border-[hsl(var(--color-border))] flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <Icon size={14} className={colors.icon} />
          <span className="text-sm font-bold text-[hsl(var(--on-surface))]">{title}</span>
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
              <li key={i} className="flex items-center gap-2 text-xs text-[hsl(var(--on-surface-variant))]">
                <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${colors.icon.replace('text-', 'bg-')}`} />
                <span className="font-medium text-[hsl(var(--on-surface))]">{item.label}</span>
                {item.sub && <span className="opacity-60">{item.sub}</span>}
              </li>
            ))}
            {items.length > 3 && (
              <li className="text-xs text-[hsl(var(--on-surface-variant))] pl-3.5 opacity-70">+{items.length - 3} รายการ</li>
            )}
          </ul>
        )}

        {sub && !items && <p className="text-xs text-[hsl(var(--on-surface-variant))] mb-3 opacity-70">{sub}</p>}

        <div className="flex items-center gap-2">
          {actionLabel && actionHref && (
            <Link
              href={actionHref}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                accent === 'green'
                  ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border border-emerald-500/20'
                  : accent === 'red'
                  ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border border-red-500/20'
                  : accent === 'yellow'
                  ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/20'
                  : 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-500/20'
              }`}
            >
              {actionLabel} <ArrowRight size={10} />
            </Link>
          )}
          {secondaryActionLabel && secondaryActionHref && (
            <Link
              href={secondaryActionHref}
              className="inline-flex items-center gap-1 rounded-lg border-[hsl(var(--color-border))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--on-surface-variant))] hover:bg-[hsl(var(--color-surface)/0.05)] transition-colors"
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
      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${dotColor} shadow-[0_0_6px_currentColor]`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[hsl(var(--on-surface))] leading-snug">
          {auditLabel(log.action)}
          <span className="font-normal text-[hsl(var(--on-surface-variant))] ml-1 opacity-70">{log.entityType}</span>
        </p>
        <p className="text-[10px] text-[hsl(var(--on-surface-variant))] mt-0.5 opacity-60">{log.userName} · {timeAgo(log.createdAt)}</p>
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
  const [userName, setUserName] = useState('');
  const [loadErrors, setLoadErrors] = useState<string[]>([]);

  const { date } = todayThai();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const errors: string[] = [];
      let occupancyOk = false;
      let summaryOk = false;
      try {
        const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
        if (meRes.ok) {
          const data = await meRes.json();
          if (data.data?.authenticated) {
            setUserName(data.data.user.displayName || data.data.user.username || '');
          }
        }
        const safe = async (url: string, options?: RequestInit) => {
          try {
            const r = await fetch(url, options);
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
          safe('/api/analytics/occupancy', { next: { revalidate: 30 } }),
          safe('/api/analytics/summary', { next: { revalidate: 30 } }),
          safe('/api/admin/maintenance?status=OPEN&pageSize=5'),
          safe('/api/payments/review?limit=1'),
          safe('/api/invoices?status=OVERDUE&pageSize=5'),
          safe('/api/admin/dashboard-alerts'),
          safe('/api/audit-logs?limit=10'),
        ]);

        if (occupancyRes?.success) { setOccupancy(occupancyRes.data); occupancyOk = true; }
        else if (!occupancyOk) errors.push('ไม่สามารถโหลดข้อมูลการเข้าพัก');
        if (summaryRes?.success) { setSummary(summaryRes.data); summaryOk = true; }
        else if (!summaryOk) errors.push('ไม่สามารถโหลดข้อมูลสรุป');

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
        if (errors.length > 0) setLoadErrors(errors);
        setLoading(false);
      }
    }
    void load();
  }, []);

  // Derive overdue 3+ days items (use due date comparison)
  const overdueItems = overdueInvoices.slice(0, 3).map((inv) => ({
    // Show room number as primary identifier; "ไม่ระบุ" only as secondary when tenant IS defined but name is null
    label: `${inv.room?.roomNumber ?? inv.room?.roomNo ?? '?'} — ${inv.tenant ? inv.tenant.fullName ?? 'ไม่ระบุ' : 'ไม่ระบุ'}`,
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
    <main className="relative min-h-screen">
      {/* ── Page Hero — dark glass strip ─────────────────── */}
      <div className="relative bg-[hsl(var(--color-surface))] border-b border-[hsl(var(--color-border))] -mx-4 sm:-mx-6 mt-[-1.5rem] pt-[1.5rem]">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.08] via-transparent to-primary/[0.04] pointer-events-none" />
        <div className="relative z-10 max-w-screen-xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <p className="text-[10px] uppercase tracking-[0.15em] font-semibold text-[hsl(var(--on-surface-variant))] opacity-60">
              Apartment ERP
            </p>
            <h1 className="text-base font-bold tracking-tight text-[hsl(var(--on-surface))] leading-none mt-0.5">
              ยินดีต้อนรับ{userName ? ` ${userName}` : ''}
            </h1>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-[hsl(var(--on-surface-variant))] font-medium opacity-70">{date}</p>
            <p className="text-[10px] text-[hsl(var(--on-surface-variant))] font-medium mt-0.5 opacity-50">{new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── KPI Row — Bento Grid ─────────────────────────── */}
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
                  sub="เงินสดที่รับได้ (ต่อเดือน)"
                  subValue={summary?.unpaidInvoices ? `${summary.unpaidInvoices} รายการ รอรับ` : undefined}
                  icon={DollarSign}
                  accent="blue"
                />
              </StaggerItem>
              {/* NOTE: monthlyRevenue is cash-basis (received this month), not accrual-basis.
                  For accrual-basis, use sum of invoice.amount where invoice.month+year = current month. */}
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

        {/* API error banner */}
        {loadErrors[0] && !loading && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-400">
            <AlertTriangle size={15} />
            {loadErrors[0]}
          </div>
        )}

        {/* ── 3 Big Action Buttons ────────────────────────────────── */}
        <StaggerList stagger={0.08} delay={0.15} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

        {/* ── Task Cards + Recent Activity — Bento Layout ─────────── */}
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

          {/* Right: Recent Activity — Glass Panel */}
          <FadeIn delay={0.4} className="rounded-2xl overflow-hidden hover:shadow-[0_0_32px_rgba(0,0,0,0.4)] transition-shadow duration-300"
          >
            <div className="rounded-2xl overflow-hidden" style={{
              background: 'hsl(var(--glass-bg))',
              backdropFilter: 'blur(20px)',
              border: '1px solid hsl(var([hsl(var(--color-border))]))',
            }}>
            <div className="px-5 py-4 border-b border-[hsl(var(--color-border))] flex items-center justify-between"
              style={{ background: 'linear-gradient(to right, hsl(217 100% 67% / 0.08), transparent)' }}
            >
              <div className="flex items-center gap-2">
                <span className="pulse-dot" />
                <Clock size={14} className="text-[hsl(var(--on-surface-variant))]" />
                <span className="text-sm font-bold text-[hsl(var(--on-surface))]">กิจกรรมล่าสุด</span>
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
                  <CheckCircle2 size={32} className="text-emerald-600 mb-2" style={{ filter: 'drop-shadow(0 0 8px rgba(16,140,80,0.3))' }} />
                  <p className="text-sm font-medium text-[hsl(var(--on-surface-variant))]">ไม่มีกิจกรรมล่าสุด</p>
                </div>
              ) : (
                <StaggerList stagger={0.04} className="divide-y divide-[hsl(var(--color-border))]">
                  {auditLogs.map((log) => (
                    <StaggerItem key={log.id}>
                      <ActivityItem log={log} />
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
            </div>
            </div>
          </FadeIn>

        </section>

      </div>
    </main>
  );
}
