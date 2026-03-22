'use client';

import { useCallback, useEffect, useState } from 'react';
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

async function safeJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-start gap-4">
      <div className={`flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className="text-xl font-bold text-slate-800 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [sumRes, revRes, occRes] = await Promise.all([
        safeJson('/api/analytics/summary'),
        safeJson('/api/analytics/revenue'),
        safeJson('/api/analytics/occupancy'),
      ]);

      if (sumRes?.success) setSummary(sumRes.data as Summary);
      if (revRes?.success && Array.isArray(revRes.data)) setRevenue(revRes.data as RevenuePoint[]);
      if (occRes?.success) setOccupancy(occRes.data as OccupancyData);
    } catch {
      setError('โหลดข้อมูลล้มเหลว กรุณาลองใหม่');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Build chart data — last 12 months
  const chartData = revenue.slice(-12).map(p => ({
    name: monthLabel(p.year, p.month),
    รายรับ: Number(p.total ?? 0),
  }));

  // Occupancy pie data
  const pieData = occupancy
    ? [
        { name: 'มีผู้เช่า', value: occupancy.occupiedRooms, fill: '#6366f1' },
        { name: 'ว่าง',     value: occupancy.vacantRooms,   fill: '#e2e8f0' },
      ]
    : [];

  const occRate = occupancy?.occupancyRate ??
    (occupancy ? Math.round((occupancy.occupiedRooms / Math.max(occupancy.totalRooms, 1)) * 100) : 0);

  return (
    <main className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">ภาพรวมสถิติและตัวชี้วัดหลัก</p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'กำลังรีเฟรช…' : 'รีเฟรช'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="รายรับเดือนนี้"   value={money(summary?.monthlyRevenue ?? 0)} icon={TrendingUp}   color="bg-indigo-500" />
          <KpiCard label="อัตราการเข้าพัก" value={`${occRate}%`}
            sub={occupancy ? `${occupancy.occupiedRooms}/${occupancy.totalRooms} ห้อง` : undefined}
            icon={Building2}  color="bg-emerald-500" />
          <KpiCard label="Invoice ชำระแล้ว" value={String(summary?.paidInvoices ?? 0)}    icon={CheckCircle} color="bg-sky-500" />
          <KpiCard label="ค้างชำระ"         value={String(summary?.overdueInvoices ?? 0)} icon={AlertCircle} color="bg-rose-500" />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Bar */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">รายรับ 12 เดือนล่าสุด (บาท)</h2>
          {loading ? (
            <div className="h-48 rounded-lg bg-slate-100 animate-pulse" />
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">ยังไม่มีข้อมูลรายรับ</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
                />
                <Tooltip
                  formatter={(v: number) => [money(v), 'รายรับ']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="รายรับ" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Occupancy Pie */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">อัตราการเข้าพัก</h2>
          {loading ? (
            <div className="h-48 rounded-lg bg-slate-100 animate-pulse" />
          ) : !occupancy ? (
            <div className="h-48 flex items-center justify-center text-sm text-slate-400">ไม่มีข้อมูล</div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [`${v} ห้อง`]}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs text-slate-500 mt-2">
                {pieData.map((d, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick links to detail reports */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">รายงานรายละเอียด</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { href: '/admin/reports/revenue',     label: 'รายรับ',          icon: BarChart2 },
            { href: '/admin/reports/occupancy',   label: 'การเข้าพัก',      icon: Building2 },
            { href: '/admin/reports/collections', label: 'การชำระเงิน',     icon: CreditCard },
            { href: '/admin/audit-logs',          label: 'ประวัติกิจกรรม',  icon: ClipboardList },
          ] as const).map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors group"
            >
              <span className="flex items-center gap-2">
                <Icon size={15} className="text-slate-400 group-hover:text-indigo-500" />
                {label}
              </span>
              <ArrowRight size={13} className="text-slate-300 group-hover:text-indigo-400" />
            </Link>
          ))}
        </div>
      </div>

      {/* Full reports link */}
      <div className="flex justify-end">
        <Link href="/admin/reports" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          <FileBarChart size={14} />
          ดูรายงานทั้งหมด →
        </Link>
      </div>
    </main>
  );
}
