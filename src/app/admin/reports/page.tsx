'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowUpDown,
  BarChart2,
  Building2,
  ClipboardList,
  CreditCard,
  RefreshCw,
  TrendingUp,
  Wallet,
  Server,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

type RevenuePoint = {
  year: number;
  month: number;
  total?: number;
  invoiced?: number;
  collected?: number;
  outstanding?: number;
};

type MonthRow = {
  year: number;
  month: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
};

type Invoice = {
  id: string;
  totalAmount: number;
  status: string;
  dueDate?: string | null;
  issuedAt?: string | null;
  createdAt?: string;
};

type AgingBucket = { label: string; days: string; amount: number; count: number };

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  createdAt: string;
};

type Summary = {
  monthlyRevenue: number;
  unpaidInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
};

type RoomStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'SELF_USE' | 'UNAVAILABLE';

type Room = {
  id: string; roomNumber: string; status: RoomStatus;
  floor?: { id: string; floorNumber: number } | null;
};

type FloorOccupancy = { floorNumber: number; total: number; occupied: number; vacant: number; maintenance?: number; occupancyRate?: number };
type OccupancyData = {
  totalRooms: number;
  occupiedRooms: number;
  vacantRooms: number;
  maintenance?: number;
  selfUse?: number;
  unavailable?: number;
  occupancyRate?: number;
  byFloor?: FloorOccupancy[];
};

// ============================================================================
// Helpers
// ============================================================================

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(amount);
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function padMonth(m: number): string { return String(m).padStart(2, '0'); }

function rateColor(rate: number): string {
  if (rate >= 90) return 'text-blue-600';
  if (rate >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function rateBarColor(rate: number): string {
  if (rate >= 90) return 'bg-blue-500';
  if (rate >= 70) return 'bg-amber-500';
  return 'bg-red-500';
}

function statusLabel(rate: number): { text: string; cls: string } {
  if (rate >= 90) return { text: 'ดี', cls: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' };
  if (rate >= 70) return { text: 'พอใช้', cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' };
  return { text: 'ต่ำ', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' };
}

function enrichRevenue(p: RevenuePoint): MonthRow {
  const collected = p.collected ?? p.total ?? 0;
  const invoiced = p.invoiced ?? collected;
  const outstanding = p.outstanding ?? Math.max(0, invoiced - collected);
  return { year: p.year, month: p.month, invoiced, collected, outstanding, collectionRate: pct(collected, invoiced) };
}

function ageDays(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function buildAging(overdueInvoices: Invoice[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { label: '0 – 30 วัน', days: '0-30', amount: 0, count: 0 },
    { label: '31 – 60 วัน', days: '31-60', amount: 0, count: 0 },
    { label: '61 – 90 วัน', days: '61-90', amount: 0, count: 0 },
    { label: '90+ วัน', days: '90+', amount: 0, count: 0 },
  ];
  for (const inv of overdueInvoices) {
    const days = ageDays(inv.dueDate ?? inv.issuedAt ?? inv.createdAt);
    if (days == null) continue;
    const amt = inv.totalAmount ?? 0;
    if (days <= 30) { buckets[0].amount += amt; buckets[0].count++; }
    else if (days <= 60) { buckets[1].amount += amt; buckets[1].count++; }
    else if (days <= 90) { buckets[2].amount += amt; buckets[2].count++; }
    else { buckets[3].amount += amt; buckets[3].count++; }
  }
  return buckets;
}

function deriveFromRooms(rooms: Room[]) {
  const counts: Record<RoomStatus, number> = { OCCUPIED: 0, VACANT: 0, MAINTENANCE: 0, SELF_USE: 0, UNAVAILABLE: 0 };
  const floorMap = new Map<number, { floorNumber: number; total: number; occupied: number; vacant: number; maintenance: number }>();
  for (const room of rooms) {
    const s = room.status;
    if (s in counts) counts[s]++;
    const fn = room.floor?.floorNumber ?? 0;
    if (!floorMap.has(fn)) floorMap.set(fn, { floorNumber: fn, total: 0, occupied: 0, vacant: 0, maintenance: 0 });
    const fl = floorMap.get(fn)!;
    fl.total++;
    if (s === 'OCCUPIED') fl.occupied++;
    if (s === 'VACANT') fl.vacant++;
    if (s === 'MAINTENANCE') fl.maintenance++;
  }
  const byFloor: FloorOccupancy[] = Array.from(floorMap.values()).sort((a, b) => a.floorNumber - b.floorNumber)
    .map((f) => ({ ...f, occupancyRate: pct(f.occupied, f.total) }));
  return { counts, byFloor, total: rooms.length };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ไม่กี่วินาที';
  if (mins < 60) return `${mins}นาที ที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ชม. ที่แล้ว`;
  return `${Math.floor(hrs / 24)}วัน ที่แล้ว`;
}

const STATUS_COLORS: Record<string, { bar: string; label: string; text: string }> = {
  OCCUPIED: { bar: 'bg-blue-500', label: 'มีผู้เช่า', text: 'text-blue-600' },
  VACANT: { bar: 'bg-emerald-500/70', label: 'ว่าง', text: 'text-emerald-600' },
  MAINTENANCE: { bar: 'bg-amber-500/70', label: 'ซ่อมบำรุง', text: 'text-amber-600' },
  SELF_USE: { bar: 'bg-slate-500/70', label: 'ใช้งานส่วนตัว', text: 'text-slate-600' },
  UNAVAILABLE: { bar: 'bg-red-500/70', label: 'ไม่พร้อม', text: 'text-red-600' },
};
const STATUS_ORDER: RoomStatus[] = ['OCCUPIED', 'VACANT', 'MAINTENANCE', 'SELF_USE', 'UNAVAILABLE'];

// ============================================================================
// Tabs
// ============================================================================

type Tab = 'overview' | 'revenue' | 'occupancy' | 'collections';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'revenue', label: 'รายได้' },
  { id: 'occupancy', label: 'ความครอบคลุม' },
  { id: 'collections', label: 'การเก็บเงิน' },
];

// ============================================================================
// Glass card base
// ============================================================================

function GlassCard({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={[
      'rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur',
      'shadow-[0_8px_32px_hsl(240_6%_10%/_0.06),0_0_0_1px_hsl(var(--color-border))]',
      hover ? 'hover:bg-[hsl(var(--color-surface))] hover:shadow-[0_12px_40px_hsl(var(--color-primary)/_0.08),0_0_0_1px_hsl(var(--color-primary)/_0.15)] hover:scale-[1.01] transition-all duration-200 cursor-pointer' : '',
      className,
    ].join(' ')}>
      {children}
    </div>
  );
}

// ============================================================================
// Tab 1: Overview
// ============================================================================

function OverviewTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setSummaryLoading(true); setAuditLoading(true);
      try {
        const [summaryRes, auditRes] = await Promise.all([
          fetch('/api/analytics/summary', { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/audit-logs?limit=10', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (summaryRes.success) setSummary(summaryRes.data);
        if (auditRes.success) setAuditRows(auditRes.data?.rows ?? []);
      } finally { setSummaryLoading(false); setAuditLoading(false); }
    }
    void load();
  }, []);

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">รายได้ต่อเดือน</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--on-surface))]">{summaryLoading ? '...' : money(summary?.monthlyRevenue ?? 0)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]">
              <Wallet className="h-5 w-5 text-blue-400" />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">ใบแจ้งหนี้ชำระแล้ว</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--on-surface))]">{summaryLoading ? '...' : (summary?.paidInvoices ?? 0)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_20px_rgba(34,197,94,0.2)]">
              <CreditCard className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">ใบแจ้งหนี้ค้างชำระ</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--on-surface))]">{summaryLoading ? '...' : (summary?.unpaidInvoices ?? 0)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.2)]">
              <AlertCircle className="h-5 w-5 text-amber-400" />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">เกินกำหนด</p>
              <p className="mt-1 text-2xl font-bold text-red-400">{summaryLoading ? '...' : (summary?.overdueInvoices ?? 0)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Report shortcut cards */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--on-surface))]/30">รายงานทั้งหมด</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { title: 'รายงานรายได้', desc: 'รายได้ ใบแจ้งหนี้ และค้างชำระรายเดือน', icon: <BarChart2 className="h-6 w-6" />, glow: 'shadow-[0_0_20px_rgba(59,130,246,0.2)]', color: 'border-blue-500/20 bg-blue-500/5', href: '/admin/reports?tab=revenue' },
            { title: 'รายงานความครอบคลุม', desc: 'อัตราการเข้าพักและสถานะห้อง', icon: <Building2 className="h-6 w-6" />, glow: 'shadow-[0_0_20px_rgba(34,197,94,0.2)]', color: 'border-emerald-500/20 bg-emerald-500/5', href: '/admin/reports?tab=occupancy' },
            { title: 'รายงานการเก็บเงิน', desc: 'อัตราการเก็บและวิเคราะห์หนี้ค้าง', icon: <CreditCard className="h-6 w-6" />, glow: 'shadow-glow-primary', color: 'border-indigo-500/20 bg-indigo-500/5', href: '/admin/reports?tab=collections' },
            { title: 'ประวัติกิจกรรม', desc: 'บันทึกการเปลี่ยนแปลงระบบทั้งหมด', icon: <ClipboardList className="h-6 w-6" />, glow: 'shadow-[0_0_20px_rgba(139,92,246,0.2)]', color: 'border-violet-500/20 bg-violet-500/5', href: '/admin/audit-logs' },
            { title: 'สถานะระบบ', desc: 'สุขภาพและล็อกการทำงาน', icon: <Server className="h-6 w-6" />, glow: 'shadow-[0_0_20px_rgba(139,92,246,0.2)]', color: 'border-violet-500/20 bg-violet-500/5', href: '/admin/system' },
          ].map((card) => (
            card.href ? (
              <Link key={card.title} href={card.href}
                className={`group flex items-start gap-4 rounded-2xl border p-5 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg ${card.color} ${card.glow}`}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-sm">{card.icon}</div>
                <div>
                  <div className="font-semibold text-[hsl(var(--on-surface))] group-hover:underline">{card.title}</div>
                  <p className="mt-0.5 text-sm text-[hsl(var(--on-surface))]/50">{card.desc}</p>
                </div>
              </Link>
            ) : (
              <div key={card.title} className={`flex items-start gap-4 rounded-2xl border p-5 ${card.color}`}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-sm">{card.icon}</div>
                <div>
                  <div className="font-semibold text-[hsl(var(--on-surface))]">{card.title}</div>
                  <p className="mt-0.5 text-sm text-[hsl(var(--on-surface))]/50">{card.desc}</p>
                </div>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <GlassCard>
        <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
          <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">กิจกรรมล่าสุด</span>
          <Link href="/admin/audit-logs" className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--on-surface))]/60 transition-colors hover:bg-[hsl(var(--color-surface))] hover:text-[hsl(var(--on-surface))]">ดูทั้งหมด</Link>
        </div>
        {auditLoading ? (
          <div className="px-6 py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">กำลังโหลด...</div>
        ) : auditRows.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">ไม่พบกิจกรรม</div>
        ) : (
          <ul className="divide-y divide-[hsl(var(--color-border))]">
            {auditRows.map((row, i) => (
              <li key={row.id} className="flex items-start gap-4 px-6 py-3">
                <div className="relative flex flex-col items-center">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[hsl(var(--primary))] ring-2 ring-[hsl(var(--primary))]/20 shadow-[var(--glow-primary)]" />
                  {i < auditRows.length - 1 && <div className="absolute top-4 h-full w-px bg-white/10" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[hsl(var(--on-surface))]">{row.action}</span>
                    <span className="inline-flex items-center rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--on-surface))]/50 border border-[hsl(var(--color-border))]">{row.entityType}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[hsl(var(--on-surface))]/30">โดย {row.userName || row.userId} · {timeAgo(row.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

// ============================================================================
// Tab 2: Revenue Report
// ============================================================================

function RevenueTab() {
  const [data, setData] = useState<RevenuePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'month' | 'invoiced' | 'collected' | 'outstanding'>('month');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const now = new Date();
  const [fromYear, setFromYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear() - 1);
  const [fromMonth, setFromMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [toYear, setToYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/analytics/revenue?months=24', { cache: 'no-store' }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถโหลดข้อมูลรายได้');
      setData(res.data ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลรายได้'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const from = fromYear * 100 + fromMonth;
    const to = toYear * 100 + toMonth;
    return data.filter((p) => { const key = p.year * 100 + p.month; return key >= from && key <= to; });
  }, [data, fromYear, fromMonth, toYear, toMonth]);

  const rows = useMemo(() => {
    const enriched = filtered.map(enrichRevenue);
    return [...enriched].sort((a, b) => {
      let va: number, vb: number;
      if (sortField === 'month') { va = a.year * 100 + a.month; vb = b.year * 100 + b.month; }
      else { va = a[sortField]; vb = b[sortField]; }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [filtered, sortField, sortDir]);

  const summary = useMemo(() => {
    const total = filtered.reduce((s, r) => s + (r.collected ?? r.total ?? 0), 0);
    const avg = filtered.length > 0 ? Math.round(total / filtered.length) : 0;
    const best = filtered.reduce((b, r) => ((r.collected ?? r.total ?? -1) > (b?.collected ?? b?.total ?? -1) ? r : b), null as RevenuePoint | null);
    return { total, avg, best };
  }, [filtered]);

  function toggleSort(field: typeof sortField) {
    setSortField(field);
    setSortDir(sortField === field ? (sortDir === 'asc' ? 'desc' : 'asc') : 'desc');
  }

  const maxCollected = Math.max(...rows.map((r) => r.collected), 1);
  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
  const YEARS = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  return (
    <div className="space-y-4">
      {error && <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 backdrop-blur"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {/* Date filter */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-[hsl(var(--on-surface))]/70">ช่วงวันที่:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--on-surface-variant))]">จาก</span>
            <select value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 backdrop-blur-sm">
              {MONTHS.map((m) => <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}</option>)}
            </select>
            <select value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 backdrop-blur-sm">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--on-surface-variant))]">ถึง</span>
            <select value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 backdrop-blur-sm">
              {MONTHS.map((m) => <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}</option>)}
            </select>
            <select value={toYear} onChange={(e) => setToYear(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 backdrop-blur-sm">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span className="text-xs text-[hsl(var(--on-surface))]/30">{filtered.length} เดือน</span>
        </div>
      </GlassCard>

      {/* Summary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">รายได้รวม</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--on-surface))]">{loading ? '...' : money(summary.total)}</p>
              <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">ในช่วงที่เลือก</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]"><Wallet className="h-5 w-5 text-blue-400" /></div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">เฉลี่ยต่อเดือน</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--on-surface))]">{loading ? '...' : money(summary.avg)}</p>
              <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">ต่อเดือน</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 shadow-glow-primary"><BarChart2 className="h-5 w-5 text-indigo-400" /></div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">เดือนที่ดีที่สุด</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--on-surface))]">{loading ? '...' : summary.best ? monthLabel(summary.best.year, summary.best.month) : '—'}</p>
              <p className="mt-1 text-xs text-emerald-400">{summary.best ? money(summary.best.collected ?? summary.best.total ?? 0) : ''}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_20px_rgba(34,197,94,0.2)]"><TrendingUp className="h-5 w-5 text-emerald-400" /></div>
          </div>
        </GlassCard>
      </div>

      {/* Bar chart */}
      {!loading && rows.length > 0 && (
        <GlassCard className="p-5 overflow-hidden">
          <div className="text-sm font-semibold text-[hsl(var(--on-surface))] mb-4">ยอดรายเดือน</div>
          <div className="flex h-44 items-end gap-1.5 overflow-x-auto pb-1">
            {[...rows].sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month)).map((row) => {
              const pct = maxCollected > 0 ? (row.collected / maxCollected) * 100 : 0;
              return (
                <div key={`${row.year}-${row.month}`} className="group relative flex min-w-[32px] flex-1 flex-col items-center justify-end">
                  <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-lg border border-[hsl(var(--color-border))] bg-black/80 px-2 py-1 text-center text-xs shadow-lg backdrop-blur group-hover:block">
                    <div className="font-semibold text-[hsl(var(--on-surface))]">{monthLabel(row.year, row.month)}</div>
                    <div className="text-emerald-400">{money(row.collected)}</div>
                  </div>
                  <div className="w-full rounded-t-md bg-[hsl(var(--primary))]/80 transition-all duration-300 hover:bg-[hsl(var(--primary))] hover:shadow-[var(--glow-primary-hover)]" style={{ height: `${Math.max(pct, 2)}%` }} />
                  <div className="mt-1 w-full truncate text-center text-[10px] text-[hsl(var(--on-surface))]/30">{padMonth(row.month)}/{String(row.year).slice(2)}</div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Table */}
      <GlassCard>
        <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
          <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">รายละเอียดรายเดือน</span>
          <span className="inline-flex items-center rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--on-surface))]/50 border border-[hsl(var(--color-border))]">{rows.length} เดือน</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--color-border))]">
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">
                  <button onClick={() => toggleSort('month')} className="flex items-center gap-1 hover:text-[hsl(var(--on-surface))] transition-colors">เดือน <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'month' ? 'text-indigo-400' : 'text-[hsl(var(--on-surface))]/30'}`} /></button>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">
                  <button onClick={() => toggleSort('invoiced')} className="flex items-center gap-1 hover:text-[hsl(var(--on-surface))] transition-colors">ออกใบแจ้ง <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'invoiced' ? 'text-indigo-400' : 'text-[hsl(var(--on-surface))]/30'}`} /></button>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">
                  <button onClick={() => toggleSort('collected')} className="flex items-center gap-1 hover:text-[hsl(var(--on-surface))] transition-colors">เก็บได้ <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'collected' ? 'text-indigo-400' : 'text-[hsl(var(--on-surface))]/30'}`} /></button>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">
                  <button onClick={() => toggleSort('outstanding')} className="flex items-center gap-1 hover:text-[hsl(var(--on-surface))] transition-colors">ค้างชำระ <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'outstanding' ? 'text-indigo-400' : 'text-[hsl(var(--on-surface))]/30'}`} /></button>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">อัตราเก็บ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="py-8 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลด...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-[hsl(var(--on-surface-variant))]">ไม่มีข้อมูล</td></tr>
                : rows.map((row) => {
                  const rate = row.invoiced > 0 ? Math.round((row.collected / row.invoiced) * 100) : 100;
                  return (
                    <tr key={`${row.year}-${row.month}`} className="border-b border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-surface))] transition-colors">
                      <td className="px-4 py-3 font-medium text-[hsl(var(--on-surface))]">{monthLabel(row.year, row.month)}</td>
                      <td className="px-4 py-3 text-[hsl(var(--on-surface))]/70">{money(row.invoiced)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-400">{money(row.collected)}</td>
                      <td className="px-4 py-3"><span className={row.outstanding > 0 ? 'font-medium text-red-400' : 'text-[hsl(var(--on-surface-variant))]'}>{money(row.outstanding)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[hsl(var(--color-surface))]">
                            <div className={`h-full rounded-full ${rateBarColor(rate)}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                          </div>
                          <span className="text-sm font-medium text-[hsl(var(--on-surface))]">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

// ============================================================================
// Tab 3: Occupancy Report
// ============================================================================

function OccupancyTab() {
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const occPromise = fetch('/api/analytics/occupancy', { cache: 'no-store' }).then((r) => r.json());
      type ApiRoom = { roomNo?: string; roomNumber?: string; roomStatus?: string; floorNo?: number };
      const PAGE_SIZE = 300;
      const allRooms: Room[] = [];
      let rp = 1;
      while (true) {
        const res = await fetch(`/api/rooms?page=${rp}&pageSize=${PAGE_SIZE}`, { cache: 'no-store' }).then((r) => r.json());
        if (!res.success) break;
        const chunk: ApiRoom[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        allRooms.push(
          ...chunk.map((r): Room => ({
            id: r.roomNo ?? r.roomNumber ?? '',
            roomNumber: r.roomNumber ?? r.roomNo ?? '',
            status: (r.roomStatus as RoomStatus) ?? 'VACANT',
            floor: r.floorNo != null ? { id: String(r.floorNo), floorNumber: r.floorNo } : null,
          })),
        );
        const total: number = (res.data?.total as number | undefined) ?? chunk.length;
        if (allRooms.length >= total || chunk.length === 0) break;
        rp += 1;
        if (rp > 50) break;
      }
      const occRes = await occPromise;
      if (occRes.success) setOccupancy(occRes.data);
      setRooms(allRooms);
    } catch (err) { setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูล'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const derived = useMemo(() => deriveFromRooms(rooms), [rooms]);

  const totalRooms = occupancy?.totalRooms ?? derived.total;
  const occupied = occupancy?.occupiedRooms ?? derived.counts.OCCUPIED;
  const vacant = occupancy?.vacantRooms ?? derived.counts.VACANT;
  const maintenance = occupancy?.maintenance ?? derived.counts.MAINTENANCE;
  const selfUse = occupancy?.selfUse ?? derived.counts.SELF_USE;
  const unavailable = occupancy?.unavailable ?? derived.counts.UNAVAILABLE;
  const occupancyRate = occupancy?.occupancyRate ?? pct(occupied, totalRooms);
  const byFloor: FloorOccupancy[] = (occupancy?.byFloor && occupancy.byFloor.length > 0) ? occupancy.byFloor : derived.byFloor;

  const distribution = [
    { status: 'OCCUPIED' as RoomStatus, count: occupied },
    { status: 'VACANT' as RoomStatus, count: vacant },
    { status: 'MAINTENANCE' as RoomStatus, count: maintenance },
    { status: 'SELF_USE' as RoomStatus, count: selfUse },
    { status: 'UNAVAILABLE' as RoomStatus, count: unavailable },
  ];

  return (
    <div className="space-y-4">
      {error && <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 backdrop-blur"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">ห้องทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(var(--on-surface))]">{loading ? '...' : totalRooms}</p>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">มีผู้เช่า</p>
          <p className="mt-1 text-2xl font-bold text-blue-400">{loading ? '...' : occupied}</p>
          <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">{pct(occupied, totalRooms)}%</p>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">ว่าง</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{loading ? '...' : vacant}</p>
          <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">{pct(vacant, totalRooms)}%</p>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">ซ่อมบำรุง</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{loading ? '...' : maintenance}</p>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">อัตราการเข้าพัก</p>
          <p className={`mt-1 text-2xl font-bold ${rateColor(occupancyRate)}`}>{loading ? '...' : `${occupancyRate}%`}</p>
        </GlassCard>
      </div>

      {/* Floor table + distribution */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <GlassCard>
          <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
            <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">ความครอบคลุมตามชั้น</span>
            <span className="inline-flex items-center rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--on-surface))]/50 border border-[hsl(var(--color-border))]">{byFloor.length} ชั้น</span>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--color-border))]">
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">ชั้น</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">ทั้งหมด</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">มีผู้เช่า</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">ว่าง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">ซ่อมบำรุง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">อัตรา</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="py-8 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลด...</td></tr>
                  : byFloor.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-[hsl(var(--on-surface-variant))]">ไม่มีข้อมูล</td></tr>
                  : byFloor.map((fl) => {
                    const rate = fl.occupancyRate ?? pct(fl.occupied, fl.total);
                    return (
                      <tr key={fl.floorNumber} className="border-b border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-surface))] transition-colors">
                        <td className="px-4 py-3 font-semibold text-[hsl(var(--on-surface))]">ชั้น {fl.floorNumber}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-[hsl(var(--on-surface))]/70">{fl.total}</td>
                        <td className="px-4 py-3 text-right font-semibold text-blue-600 tabular-nums">{fl.occupied}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600 tabular-nums">{fl.vacant}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-600 tabular-nums">{fl.maintenance ?? 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-[hsl(var(--color-surface))]">
                              <div className={`h-full rounded-full transition-all ${rateBarColor(rate)}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                            </div>
                            <span className={`text-sm font-semibold tabular-nums ${rateColor(rate)}`}>{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* Status distribution */}
        <GlassCard className="p-5">
          <div className="text-sm font-semibold text-[hsl(var(--on-surface))] mb-4">สถานะห้อง</div>
          {loading ? <div className="py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">กำลังโหลด...</div> : (
            <div className="flex flex-col gap-4">
              <div className="flex h-4 w-full overflow-hidden rounded-full">
                {distribution.filter((d) => d.count > 0).map((d) => {
                  const width = pct(d.count, totalRooms);
                  const cfg = STATUS_COLORS[d.status];
                  return <div key={d.status} className={`${cfg.bar} transition-all first:rounded-l-full last:rounded-r-full`} style={{ width: `${width}%` }} title={`${cfg.label}: ${d.count}`} />;
                })}
              </div>
              <div className="flex flex-col gap-3">
                {STATUS_ORDER.map((status) => {
                  const entry = distribution.find((d) => d.status === status);
                  const count = entry?.count ?? 0;
                  const cfg = STATUS_COLORS[status];
                  const rate = pct(count, totalRooms);
                  return (
                    <div key={status} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-sm ${cfg.bar}`} /><span className="font-medium text-[hsl(var(--on-surface))]">{cfg.label}</span></div>
                        <div className="flex items-center gap-2 tabular-nums"><span className={`font-semibold ${cfg.text}`}>{count}</span><span className="text-[hsl(var(--on-surface))]/30">·</span><span className="text-[hsl(var(--on-surface))]/30">{rate}%</span></div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--color-surface))]"><div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${rate}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-[hsl(var(--color-border))] pt-3">
                <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">รวม</span>
                <span className="text-lg font-bold text-[hsl(var(--on-surface))] tabular-nums">{totalRooms}</span>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

// ============================================================================
// Tab 4: Collections Report
// ============================================================================

function CollectionsTab() {
  const now = new Date();
  const [fromYear, setFromYear] = useState(now.getFullYear() - 1);
  const [fromMonth, setFromMonth] = useState(now.getMonth() + 1);
  const [toYear, setToYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState(now.getMonth() + 1);

  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [overdueInvoices, setOverdueInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const revRes = await fetch('/api/analytics/revenue?months=12', { cache: 'no-store' }).then((r) => r.json());
      if (!revRes.success) throw new Error(revRes.error?.message || 'ไม่สามารถโหลดข้อมูลรายได้');
      setRevenueData(revRes.data ?? []);

      const PAGE_SIZE = 100;
      const allOverdue: Invoice[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(`/api/invoices?status=OVERDUE&page=${page}&pageSize=${PAGE_SIZE}`, { cache: 'no-store' }).then((r) => r.json());
        if (!res.success) break;
        const chunk: Invoice[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        allOverdue.push(...chunk);
        const total: number = (res.data?.total as number | undefined) ?? chunk.length;
        if (allOverdue.length >= total || chunk.length === 0) break;
        page += 1;
        if (page > 100) break;
      }
      setOverdueInvoices(allOverdue);
    } catch (err) { setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูล'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const from = fromYear * 100 + fromMonth;
    const to = toYear * 100 + toMonth;
    return revenueData.filter((p) => { const key = p.year * 100 + p.month; return key >= from && key <= to; });
  }, [revenueData, fromYear, fromMonth, toYear, toMonth]);

  const rows = useMemo<MonthRow[]>(() =>
    [...filtered.map(enrichRevenue)].sort((a, b) => b.year * 100 + b.month - (a.year * 100 + a.month)), [filtered]);

  const summary = useMemo(() => {
    const totalInvoiced = rows.reduce((s, r) => s + r.invoiced, 0);
    const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
    const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
    return { totalInvoiced, totalCollected, totalOutstanding, collectionRate: pct(totalCollected, totalInvoiced) };
  }, [rows]);

  const agingBuckets = useMemo(() => buildAging(overdueInvoices), [overdueInvoices]);
  const maxAgingAmount = Math.max(...agingBuckets.map((b) => b.amount), 1);

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
  const YEARS = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  return (
    <div className="space-y-4">
      {error && <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 backdrop-blur"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {/* Date filter */}
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-[hsl(var(--on-surface))]/70">ช่วงวันที่:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--on-surface-variant))]">จาก</span>
            <select value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 backdrop-blur-sm">
              {MONTHS.map((m) => <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}</option>)}
            </select>
            <select value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 backdrop-blur-sm">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--on-surface-variant))]">ถึง</span>
            <select value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 backdrop-blur-sm">
              {MONTHS.map((m) => <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}</option>)}
            </select>
            <select value={toYear} onChange={(e) => setToYear(Number(e.target.value))}
              className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 backdrop-blur-sm">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span className="text-xs text-[hsl(var(--on-surface))]/30">{rows.length} เดือน</span>
        </div>
      </GlassCard>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">ออกใบแจ้งทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-[hsl(var(--on-surface))]">{loading ? '...' : money(summary.totalInvoiced)}</p>
          <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">ในช่วงที่เลือก</p>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">เก็บได้ทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{loading ? '...' : money(summary.totalCollected)}</p>
          <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">ได้รับชำระ</p>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">อัตราการเก็บ</p>
          <p className={`mt-1 text-2xl font-bold ${rateColor(summary.collectionRate)}`}>{loading ? '...' : `${summary.collectionRate}%`}</p>
          <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">เก็บ / ออกใบแจ้ง</p>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">ค้างชำระ</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{loading ? '...' : money(summary.totalOutstanding)}</p>
          <p className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">ยอดคงค้าง</p>
        </GlassCard>
      </div>

      {/* Month table */}
      <GlassCard>
        <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
          <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">รายเดือน</span>
          <span className="inline-flex items-center rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--on-surface))]/50 border border-[hsl(var(--color-border))]">{rows.length} เดือน</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--color-border))]">
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">เดือน</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">ออกใบแจ้ง</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">เก็บได้</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">ค้างชำระ</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">อัตราเก็บ</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="py-8 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลด...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-[hsl(var(--on-surface-variant))]">ไม่มีข้อมูล</td></tr>
                : rows.map((row) => {
                  const sl = statusLabel(row.collectionRate);
                  return (
                    <tr key={`${row.year}-${row.month}`} className="border-b border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-surface))] transition-colors">
                      <td className="px-4 py-3 font-medium text-[hsl(var(--on-surface))]">{monthLabel(row.year, row.month)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[hsl(var(--on-surface))]/70">{money(row.invoiced)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600 tabular-nums">{money(row.collected)}</td>
                      <td className="px-4 py-3 text-right"><span className={row.outstanding > 0 ? 'tabular-nums font-medium text-red-400' : 'text-[hsl(var(--on-surface-variant))]'}>{money(row.outstanding)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[hsl(var(--color-surface))]">
                            <div className={`h-full rounded-full ${rateBarColor(row.collectionRate)}`} style={{ width: `${Math.min(row.collectionRate, 100)}%` }} />
                          </div>
                          <span className={`text-sm font-semibold tabular-nums ${rateColor(row.collectionRate)}`}>{row.collectionRate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${sl.cls}`}>{sl.text}</span></td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Aging analysis */}
      <GlassCard className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-[hsl(var(--on-surface))]">วิเคราะห์หนี้ค้าง</div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-sm text-[hsl(var(--on-surface))]/50">{overdueInvoices.length} ใบแจ้งหนี้เกินกำหนด</span>
          </div>
        </div>
        {loading ? <div className="py-8 text-center text-sm text-[hsl(var(--on-surface-variant))]">กำลังโหลด...</div> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {agingBuckets.map((bucket) => {
              const barPct = maxAgingAmount > 0 ? (bucket.amount / maxAgingAmount) * 100 : 0;
              const isSerious = bucket.days === '90+';
              return (
                <div key={bucket.days} className={`rounded-2xl border p-4 ${isSerious ? 'border-red-500/30 bg-red-500/5 shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-[hsl(var(--color-border))] bg-white/[0.02]'}`}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--on-surface-variant))]">{bucket.label}</div>
                  <div className={`text-2xl font-bold tabular-nums ${isSerious ? 'text-red-400' : 'text-[hsl(var(--on-surface))]'}`}>{money(bucket.amount)}</div>
                  <div className="mt-1 text-xs text-[hsl(var(--on-surface))]/30">{bucket.count} ใบแจ้งหนี้</div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--color-surface))]">
                    <div className={`h-full rounded-full transition-all ${isSerious ? 'bg-red-500' : 'bg-indigo-500/50'}`} style={{ width: `${barPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && overdueInvoices.length === 0 && (
          <p className="mt-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.1)]">ไม่มีใบแจ้งหนี้เกินกำหนด ทุกรายการชำระครบแล้ว</p>
        )}
      </GlassCard>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AdminReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs: Tab[] = ['overview', 'revenue', 'occupancy', 'collections'];
  const initialTab = validTabs.includes(tabParam as Tab) ? (tabParam as Tab) : 'overview';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === 'overview') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/80 to-blue-700/60 px-6 py-5 shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_1px_rgba(99,102,241,0.1)] backdrop-blur">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.1),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 shadow-[0_4px_16px_rgba(99,102,241,0.15)]">
              <BarChart2 className="h-5 w-5 text-[hsl(var(--on-surface))]" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--on-surface))]">รายงาน</h1>
              <p className="text-xs text-[hsl(var(--on-surface))]/60 mt-0.5">ภาพรวมรายงานทางการเงิน สถานะห้อง และกิจกรรมระบบ</p>
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-xl bg-white/10 border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-semibold text-[hsl(var(--on-surface))] shadow-sm transition-all hover:bg-white/20 hover:shadow-[0_4px_16px_rgba(255,255,255,0.1)] active:scale-95">
            <RefreshCw className="h-4 w-4" />รีเฟรช
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="inline-flex items-center gap-1 rounded-xl border border-[hsl(var(--color-border))] bg-white/[0.03] p-1 backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => handleTabChange(tab.id)}
            className={['px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95',
              activeTab === tab.id
                ? 'bg-indigo-500/20 text-indigo-600 shadow-[0_4px_16px_rgba(99,102,241,0.15)] border border-indigo-500/30'
                : 'text-[hsl(var(--on-surface))]/50 hover:bg-[hsl(var(--color-surface))] hover:text-[hsl(var(--on-surface))]/80'].join(' ')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'revenue' && <RevenueTab />}
        {activeTab === 'occupancy' && <OccupancyTab />}
        {activeTab === 'collections' && <CollectionsTab />}
      </div>
    </main>
  );
}
