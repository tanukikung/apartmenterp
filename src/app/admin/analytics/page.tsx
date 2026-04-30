'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  BarChart2,
  Building2,
  CheckCircle,
  ClipboardList,
  CreditCard,
  FileBarChart,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  monthlyRevenue: number;
  unpaidInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
}

interface RevenuePoint {
  year: number;
  month: number;
  total?: number;
}

interface OccupancyData {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  occupancyRate?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function money(n: number) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(n);
}

function monthLabel(year: number, month: number) {
  return `${THAI_MONTHS[month - 1]} ${String(year).slice(2)}`;
}

// ─── Glass Card ──────────────────────────────────────────────────────────────────

function GlassCard({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={[
      'rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]',
      'shadow-[0_1px_3px_rgba(0,0,0,0.5)]',
      hover ? 'hover:bg-[hsl(var(--color-surface-hover))] hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)] hover:scale-[1.01] transition-all duration-200 cursor-pointer' : '',
      className,
    ].join(' ')}>
      {children}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  colorClass,
  glowClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  colorClass: string;
  glowClass: string;
}) {
  return (
    <GlassCard className="p-5" hover>
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border ${colorClass} ${glowClass}`}>
          <Icon size={18} className="text-[hsl(var(--on-surface))]" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[hsl(var(--on-surface-variant))] font-medium truncate">{label}</p>
          <p className="text-xl font-bold text-[hsl(var(--on-surface))] mt-0.5">{value}</p>
          {sub && <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">{sub}</p>}
        </div>
      </div>
    </GlassCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

async function fetchAnalyticsSummary() {
  const r = await fetch('/api/analytics/summary');
  if (!r.ok) throw new Error('Failed to fetch summary');
  const json = await r.json() as Record<string, unknown>;
  if (!json.success) throw new Error('API error');
  return json.data as Summary;
}

async function fetchAnalyticsRevenue() {
  const r = await fetch('/api/analytics/revenue');
  if (!r.ok) throw new Error('Failed to fetch revenue');
  const json = await r.json() as Record<string, unknown>;
  if (!json.success) throw new Error('API error');
  return (json.data as RevenuePoint[] ?? []);
}

async function fetchAnalyticsOccupancy() {
  const r = await fetch('/api/analytics/occupancy');
  if (!r.ok) throw new Error('Failed to fetch occupancy');
  const json = await r.json() as Record<string, unknown>;
  if (!json.success) throw new Error('API error');
  return json.data as OccupancyData;
}

export default function AnalyticsPage() {
  const { data: summary, isLoading, error, refetch: refetchSummary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: fetchAnalyticsSummary,
  });

  const { data: revenue = [], refetch: refetchRevenue } = useQuery({
    queryKey: ['analytics-revenue'],
    queryFn: fetchAnalyticsRevenue,
  });

  const { data: occupancy, refetch: refetchOccupancy } = useQuery({
    queryKey: ['analytics-occupancy'],
    queryFn: fetchAnalyticsOccupancy,
  });

  const refreshing = false;

  const load = () => {
    void refetchSummary();
    void refetchRevenue();
    void refetchOccupancy();
  };

  // Build chart data — last 12 months
  const chartData = revenue.slice(-12).map(p => ({
    name: monthLabel(p.year, p.month),
    รายรับ: Number(p.total ?? 0),
  }));

  // Occupancy pie data
  const pieData = occupancy
    ? [
        { name: 'มีผู้เช่า', value: occupancy.occupiedRooms, fill: 'hsl(217, 55%, 24%)' },
        { name: 'ว่าง',     value: occupancy.vacantRooms,   fill: 'rgba(255,255,255,0.15)' },
      ]
    : [];

  const occRate = occupancy?.occupancyRate ??
    (occupancy ? Math.round((occupancy.occupiedRooms / Math.max(occupancy.totalRooms, 1)) * 100) : 0);

  return (
    <main className="space-y-6 p-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-[hsl(var(--primary))] px-6 py-5">
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--color-surface))]/15 ring-1 ring-[hsl(var(--color-border))]">
              <TrendingUp className="h-5 w-5 text-[hsl(var(--on-primary))]" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--on-primary))]">การวิเคราะห์</h1>
              <p className="text-xs text-[hsl(var(--on-primary)/0.7)] mt-0.5">ภาพรวมสถิติและตัวชี้วัดหลัก</p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.15)] px-4 py-2 text-sm font-medium text-[hsl(var(--on-primary))] shadow-sm transition-all hover:bg-[hsl(var(--color-surface)/0.25)] active:scale-95"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'กำลังรีเฟรช…' : 'รีเฟรช'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <GlassCard className="p-4">
          <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle size={16} className="shrink-0" />
            {error.message}
          </div>
        </GlassCard>
      )}

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="รายรับเดือนนี้"   value={money(summary?.monthlyRevenue ?? 0)} icon={TrendingUp}   colorClass="border-blue-500/30 bg-blue-500/10" glowClass="shadow-[0_4px_16px_rgba(59,130,246,0.15)]" />
          <KpiCard label="อัตราการเข้าพัก" value={`${occRate}%`
            }
            sub={occupancy ? `${occupancy.occupiedRooms}/${occupancy.totalRooms} ห้อง` : undefined}
            icon={Building2}  colorClass="border-emerald-500/30 bg-emerald-500/10" glowClass="shadow-[0_4px_16px_rgba(34,197,94,0.15)]" />
          <KpiCard label="Invoice ชำระแล้ว" value={String(summary?.paidInvoices ?? 0)}    icon={CheckCircle} colorClass="border-indigo-500/30 bg-indigo-500/10" glowClass="shadow-[0_4px_16px_rgba(99,102,241,0.15)]" />
          <KpiCard label="ค้างชำระ"         value={String(summary?.overdueInvoices ?? 0)} icon={AlertCircle} colorClass="border-amber-500/30 bg-amber-500/10" glowClass="shadow-[0_4px_16px_rgba(251,191,36,0.15)]" />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Bar */}
        <GlassCard className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-[hsl(var(--on-surface))] mb-4">รายรับ 12 เดือนล่าสุด (บาท)</h2>
          {isLoading ? (
            <div className="h-48 rounded-xl bg-[hsl(var(--color-surface))] animate-pulse" />
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-[hsl(var(--on-surface-variant))]">ยังไม่มีข้อมูลรายรับ</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--on-surface-variant))' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--on-surface-variant))' }}
                  tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                />
                <Tooltip
                  formatter={(v: unknown) => [money(Number(v) || 0), 'รายรับ']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--color-border))', background: 'hsl(var(--color-surface))', backdropFilter: 'blur(20px)', color: 'hsl(var(--on-surface))' }}
                />
                <Bar dataKey="รายรับ" fill="hsl(217, 55%, 24%)" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        {/* Occupancy Pie */}
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-[hsl(var(--on-surface))] mb-4">อัตราการเข้าพัก</h2>
          {isLoading ? (
            <div className="h-48 rounded-xl bg-[hsl(var(--color-surface))] animate-pulse" />
          ) : !occupancy ? (
            <div className="h-48 flex items-center justify-center text-sm text-[hsl(var(--on-surface-variant))]">ไม่มีข้อมูล</div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown) => [`${String(v)} ห้อง`]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--color-border))', background: 'hsl(var(--color-surface))', backdropFilter: 'blur(20px)', color: 'hsl(var(--on-surface))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs text-[hsl(var(--on-surface-variant))] mt-2">
                {pieData.map((d, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: d.fill === 'rgba(255,255,255,0.15)' ? 'hsl(217, 55%, 24%)' : d.fill as string }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Quick links to detail reports */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-semibold text-[hsl(var(--on-surface))] mb-3">รายงานรายละเอียด</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { href: '/admin/reports?tab=revenue',     label: 'รายรับ',          icon: BarChart2 },
            { href: '/admin/reports?tab=occupancy',   label: 'การเข้าพัก',      icon: Building2 },
            { href: '/admin/reports?tab=collections', label: 'การชำระเงิน',     icon: CreditCard },
            { href: '/admin/audit-logs',              label: 'ประวัติกิจกรรม',  icon: ClipboardList },
          ] as const).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3 text-sm font-medium text-[hsl(var(--on-surface-variant))] transition-all hover:scale-[1.02] hover:bg-[hsl(var(--color-surface))] hover:text-[hsl(var(--on-surface))] active:scale-[0.98] group"
            >
              <span className="flex items-center gap-2">
                <Icon size={15} className="text-[hsl(var(--primary))]" />
                {label}
              </span>
              <ArrowRight size={13} className="text-[hsl(var(--on-surface-variant))] group-hover:text-[hsl(var(--primary))] transition-colors" />
            </Link>
          ))}
        </div>
      </GlassCard>

      {/* Full reports link */}
      <div className="flex justify-end">
        <Link href="/admin/reports" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-500 font-medium transition-colors">
          <FileBarChart size={14} />
          ดูรายงานทั้งหมด →
        </Link>
      </div>
    </main>
  );
}
