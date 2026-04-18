'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Home, AlertTriangle, DollarSign, Wrench, Receipt, ClipboardCheck, FileText, Megaphone, ArrowRight, Clock, CheckCircle2 } from 'lucide-react';

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
    green: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'bg-emerald-100 text-emerald-600', text: 'text-emerald-600' },
    red: { bg: 'bg-red-50', border: 'border-red-200', icon: 'bg-red-100 text-red-600', text: 'text-red-600' },
    yellow: { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'bg-amber-100 text-amber-600', text: 'text-amber-600' },
    blue: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'bg-blue-100 text-blue-600', text: 'text-blue-600' },
  }[accent];

  const card = (
    <div className={`${colors.bg} ${colors.border} border rounded-xl p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${colors.icon}`}>
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>
      <div className={`text-2xl font-extrabold tracking-tight ${colors.text} leading-none mb-1`}>{value}</div>
      {sub && <div className="text-xs text-on-surface-variant mt-1">{sub}</div>}
    </div>
  );

  if (href) {
    return <Link href={href} className="block">{card}</Link>;
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
    blue: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200',
    green: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200',
    red: 'bg-red-600 hover:bg-red-700 text-white shadow-red-200',
  }[color];

  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl py-4 px-6 font-bold text-sm shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${colors}`}
    >
      <Icon size={22} strokeWidth={2} />
      {label}
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
    green: { bg: 'bg-white', border: 'border-emerald-200', header: 'bg-emerald-50 text-emerald-700', count: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-500' },
    red: { bg: 'bg-white', border: 'border-red-200', header: 'bg-red-50 text-red-700', count: 'bg-red-100 text-red-700', icon: 'text-red-500' },
    yellow: { bg: 'bg-white', border: 'border-amber-200', header: 'bg-amber-50 text-amber-700', count: 'bg-amber-100 text-amber-700', icon: 'text-amber-500' },
    blue: { bg: 'bg-white', border: 'border-blue-200', header: 'bg-blue-50 text-blue-700', count: 'bg-blue-100 text-blue-700', icon: 'text-blue-500' },
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

  return (
    <main className="min-h-screen bg-gray-50/50">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary to-primary/80 px-6 py-6 shadow-lg">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            {greeting} 👋
          </h1>
          <p className="text-sm text-white/80 font-medium">{date}</p>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── KPI Row ─────────────────────────────────────────────── */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            <>
              <SkeletonCard className="h-28" />
              <SkeletonCard className="h-28" />
              <SkeletonCard className="h-28" />
              <SkeletonCard className="h-28" />
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
        </section>

        {/* ── 3 Big Action Buttons ────────────────────────────────── */}
        <section className="grid grid-cols-3 gap-4">
          <ActionButton
            label="ตรวจสลิป"
            icon={ClipboardCheck}
            color="blue"
            href="/admin/payments/review"
          />
          <ActionButton
            label="วางบิล"
            icon={Receipt}
            color="green"
            href="/admin/billing"
          />
          <ActionButton
            label="ดูค้างชำระ"
            icon={FileText}
            color="red"
            href="/admin/overdue"
          />
        </section>

        {/* ── Task Cards + Recent Activity ─────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Task Cards Grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* รอตรวจสลิป */}
            <TaskCard
              title="รอตรวจสลิป"
              count={unmatchedPayments}
              icon={ClipboardCheck}
              accent="blue"
              actionLabel="ตรวจเลย"
              actionHref="/admin/payments/review"
            />

            {/* ค้างชำระ 3+ วัน */}
            <TaskCard
              title="ค้างชำระ"
              count={overdueCount}
              icon={AlertTriangle}
              accent="red"
              items={overdueItems}
              actionLabel="ดูทั้งหมด"
              actionHref="/admin/overdue"
            />

            {/* แจ้งซ่อมใหม่ */}
            <TaskCard
              title="แจ้งซ่อมใหม่"
              count={pendingMaintenanceCount}
              icon={Wrench}
              accent="yellow"
              items={maintenanceItems}
              actionLabel="ดู"
              actionHref="/admin/maintenance"
            />

            {/* สัญญาใกล้หมด */}
            <TaskCard
              title="สัญญาใกล้หมด"
              count={expiringContracts.length}
              icon={FileText}
              accent="yellow"
              items={contractItems}
              actionLabel="ต่อสัญญา"
              actionHref="/admin/contracts"
            />

            {/* ประกาศ */}
            <TaskCard
              title="ประกาศ"
              icon={Megaphone}
              accent="blue"
              actionLabel="ส่งประกาศ"
              actionHref="/admin/broadcast"
            />

          </div>

          {/* Right: Recent Activity */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-all duration-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-400" />
                <span className="text-sm font-bold text-on-surface">กิจกรรมล่าสุด</span>
              </div>
              <Link
                href="/admin/audit-logs"
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                ดูทั้งหมด <ArrowRight size={10} />
              </Link>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="skeleton h-10 rounded-lg" />
                  ))}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 size={28} className="text-gray-300 mb-2" />
                  <p className="text-sm font-medium text-gray-400">ไม่มีกิจกรรมล่าสุด</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {auditLogs.map((log) => (
                    <ActivityItem key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
          </div>

        </section>

      </div>
    </main>
  );
}
