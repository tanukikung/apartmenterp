'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  if (rate >= 90) return 'text-emerald-700';
  if (rate >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function rateBarColor(rate: number): string {
  if (rate >= 90) return 'bg-emerald-500';
  if (rate >= 70) return 'bg-amber-400';
  return 'bg-red-500';
}

function statusLabel(rate: number): { text: string; cls: string } {
  if (rate >= 90) return { text: 'ดี', cls: 'bg-emerald-100 text-emerald-700' };
  if (rate >= 70) return { text: 'พอใช้', cls: 'bg-amber-100 text-amber-700' };
  return { text: 'ต่ำ', cls: 'bg-red-100 text-red-700' };
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
  OCCUPIED: { bar: 'bg-indigo-500', label: 'มีผู้เช่า', text: 'text-indigo-700' },
  VACANT: { bar: 'bg-emerald-500', label: 'ว่าง', text: 'text-emerald-700' },
  MAINTENANCE: { bar: 'bg-amber-400', label: 'ซ่อมบำรุง', text: 'text-amber-700' },
  SELF_USE: { bar: 'bg-slate-400', label: 'ใช้งานส่วนตัว', text: 'text-slate-600' },
  UNAVAILABLE: { bar: 'bg-red-400', label: 'ไม่พร้อม', text: 'text-red-700' },
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
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">รายได้ต่อเดือน</p>
              <p className="mt-1 text-2xl font-bold text-on-surface">{summaryLoading ? '...' : money(summary?.monthlyRevenue ?? 0)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 shadow-sm"><Wallet className="h-5 w-5 text-blue-600" /></div>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">ใบแจ้งหนี้ชำระแล้ว</p>
              <p className="mt-1 text-2xl font-bold text-on-surface">{summaryLoading ? '...' : (summary?.paidInvoices ?? 0)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm"><CreditCard className="h-5 w-5 text-emerald-600" /></div>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">ใบแจ้งหนี้ค้างชำระ</p>
              <p className="mt-1 text-2xl font-bold text-on-surface">{summaryLoading ? '...' : (summary?.unpaidInvoices ?? 0)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 shadow-sm"><AlertCircle className="h-5 w-5 text-amber-600" /></div>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">เกินกำหนด</p>
              <p className="mt-1 text-2xl font-bold text-red-700">{summaryLoading ? '...' : (summary?.overdueInvoices ?? 0)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-error-container/30 bg-error-container/10 shadow-sm"><AlertCircle className="h-5 w-5 text-on-error-container" /></div>
          </div>
        </div>
      </div>

      {/* Report shortcut cards */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">รายงานทั้งหมด</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { title: 'รายงานรายได้', desc: 'รายได้ ใบแจ้งหนี้ และค้างชำระรายเดือน', icon: <BarChart2 className="h-6 w-6" />, color: 'bg-blue-50 border-blue-200 text-blue-700', href: null },
            { title: 'รายงานความครอบคลุม', desc: 'อัตราการเข้าพักและสถานะห้อง', icon: <Building2 className="h-6 w-6" />, color: 'bg-emerald-50 border-emerald-200 text-emerald-700', href: null },
            { title: 'รายงานการเก็บเงิน', desc: 'อัตราการเก็บและวิเคราะห์หนี้ค้าง', icon: <CreditCard className="h-6 w-6" />, color: 'bg-primary-container border-primary/20 text-primary', href: null },
            { title: 'ประวัติกิจกรรม', desc: 'บันทึกการเปลี่ยนแปลงระบบทั้งหมด', icon: <ClipboardList className="h-6 w-6" />, color: 'bg-surface-container border-outline text-on-surface-variant', href: '/admin/audit-logs' },
            { title: 'สถานะระบบ', desc: 'สุขภาพและล็อกการทำงาน', icon: <Server className="h-6 w-6" />, color: 'bg-purple-50 border-purple-200 text-purple-700', href: '/admin/system' },
          ].map((card) => (
            card.href ? (
              <Link key={card.title} href={card.href}
                className={`group flex items-start gap-4 rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${card.color}`}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-white/70 shadow-sm">{card.icon}</div>
                <div>
                  <div className="font-semibold group-hover:underline">{card.title}</div>
                  <p className="mt-0.5 text-sm opacity-80">{card.desc}</p>
                </div>
              </Link>
            ) : (
              <div key={card.title} className={`flex items-start gap-4 rounded-2xl border p-5 shadow-sm ${card.color}`}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-white/70 shadow-sm">{card.icon}</div>
                <div>
                  <div className="font-semibold">{card.title}</div>
                  <p className="mt-0.5 text-sm opacity-80">{card.desc}</p>
                </div>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <span className="text-sm font-semibold text-on-surface">กิจกรรมล่าสุด</span>
          <Link href="/admin/audit-logs" className="inline-flex items-center gap-1.5 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container">ดูทั้งหมด</Link>
        </div>
        {auditLoading ? (
          <div className="px-6 py-8 text-center text-sm text-on-surface-variant">กำลังโหลด...</div>
        ) : auditRows.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-on-surface-variant">ไม่พบกิจกรรม</div>
        ) : (
          <ul className="divide-y divide-outline-variant/10">
            {auditRows.map((row, i) => (
              <li key={row.id} className="flex items-start gap-4 px-6 py-3">
                <div className="relative flex flex-col items-center">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface-container-lowest" />
                  {i < auditRows.length - 1 && <div className="absolute top-4 h-full w-px bg-outline-variant/30" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-on-surface">{row.action}</span>
                    <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-medium text-on-surface-variant">{row.entityType}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-on-surface-variant/70">โดย {row.userName || row.userId} · {timeAgo(row.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
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
    const best = filtered.reduce((b, r) => ((r.collected ?? r.total ?? 0) > (b?.collected ?? b?.total ?? -1) ? r : b), null as RevenuePoint | null);
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
      {error && <div className="flex items-center gap-3 rounded-xl border border-error-container bg-error-container/20 px-4 py-3 text-sm text-on-error-container"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {/* Date filter */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-on-surface">ช่วงวันที่:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant">จาก</span>
            <select value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {MONTHS.map((m) => <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}</option>)}
            </select>
            <select value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant">ถึง</span>
            <select value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {MONTHS.map((m) => <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}</option>)}
            </select>
            <select value={toYear} onChange={(e) => setToYear(Number(e.target.value))}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span className="text-xs text-on-surface-variant">{filtered.length} เดือน</span>
        </div>
      </section>

      {/* Summary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">รายได้รวม</p>
              <p className="mt-1 text-2xl font-bold text-on-surface">{loading ? '...' : money(summary.total)}</p>
              <p className="mt-1 text-xs text-on-surface-variant">ในช่วงที่เลือก</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 shadow-sm"><Wallet className="h-5 w-5 text-blue-600" /></div>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">เฉลี่ยต่อเดือน</p>
              <p className="mt-1 text-2xl font-bold text-on-surface">{loading ? '...' : money(summary.avg)}</p>
              <p className="mt-1 text-xs text-on-surface-variant">ต่อเดือน</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary-container/20 shadow-sm"><BarChart2 className="h-5 w-5 text-primary" /></div>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">เดือนที่ดีที่สุด</p>
              <p className="mt-1 text-2xl font-bold text-on-surface">{loading ? '...' : summary.best ? monthLabel(summary.best.year, summary.best.month) : '—'}</p>
              <p className="mt-1 text-xs text-on-surface-variant">{summary.best ? money(summary.best.collected ?? summary.best.total ?? 0) : ''}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 shadow-sm"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
          </div>
        </div>
      </div>

      {/* Bar chart */}
      {!loading && rows.length > 0 && (
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 overflow-hidden">
          <div className="text-sm font-semibold text-on-surface mb-4">ยอดรายเดือน</div>
          <div className="flex h-44 items-end gap-1.5 overflow-x-auto pb-1">
            {[...rows].sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month)).map((row) => {
              const pct = maxCollected > 0 ? (row.collected / maxCollected) * 100 : 0;
              return (
                <div key={`${row.year}-${row.month}`} className="group relative flex min-w-[32px] flex-1 flex-col items-center justify-end">
                  <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-lg border border-outline-variant bg-surface-container-lowest px-2 py-1 text-center text-xs shadow-lg group-hover:block">
                    <div className="font-semibold text-on-surface">{monthLabel(row.year, row.month)}</div>
                    <div className="text-emerald-700">{money(row.collected)}</div>
                  </div>
                  <div className="w-full rounded-t-md bg-primary/80 transition-all duration-300 hover:bg-primary" style={{ height: `${Math.max(pct, 2)}%` }} />
                  <div className="mt-1 w-full truncate text-center text-[10px] text-on-surface-variant">{padMonth(row.month)}/{String(row.year).slice(2)}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Table */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <span className="text-sm font-semibold text-on-surface">รายละเอียดรายเดือน</span>
          <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">{rows.length} เดือน</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  <button onClick={() => toggleSort('month')} className="flex items-center gap-1">เดือน <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'month' ? 'text-primary' : 'text-on-surface-variant'}`} /></button>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  <button onClick={() => toggleSort('invoiced')} className="flex items-center gap-1">ออกใบแจ้ง <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'invoiced' ? 'text-primary' : 'text-on-surface-variant'}`} /></button>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  <button onClick={() => toggleSort('collected')} className="flex items-center gap-1">เก็บได้ <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'collected' ? 'text-primary' : 'text-on-surface-variant'}`} /></button>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  <button onClick={() => toggleSort('outstanding')} className="flex items-center gap-1">ค้างชำระ <ArrowUpDown className={`h-3.5 w-3.5 ${sortField === 'outstanding' ? 'text-primary' : 'text-on-surface-variant'}`} /></button>
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">อัตราเก็บ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="py-8 text-center text-on-surface-variant">กำลังโหลด...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-on-surface-variant">ไม่มีข้อมูล</td></tr>
                : rows.map((row) => {
                  const rate = row.invoiced > 0 ? Math.round((row.collected / row.invoiced) * 100) : 100;
                  return (
                    <tr key={`${row.year}-${row.month}`} className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-on-surface">{monthLabel(row.year, row.month)}</td>
                      <td className="px-4 py-3 text-on-surface">{money(row.invoiced)}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">{money(row.collected)}</td>
                      <td className="px-4 py-3"><span className={row.outstanding > 0 ? 'font-medium text-red-600' : 'text-on-surface-variant'}>{money(row.outstanding)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-container">
                            <div className={`h-full rounded-full ${rate >= 90 ? 'bg-emerald-500' : rate >= 70 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                          </div>
                          <span className="text-sm font-medium text-on-surface">{rate}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
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
      // Occupancy API now returns totals AND by-floor breakdown computed
      // server-side from every room. The rooms list is only used as a
      // fallback, so we paginate through /api/rooms to cover all of them
      // (not just the first 100) to keep the fallback accurate as well.
      const occPromise = fetch('/api/analytics/occupancy', { cache: 'no-store' }).then((r) => r.json());

      // The /api/rooms endpoint returns { roomNo, roomStatus, floorNo, ... } but
      // this page's Room type expects { id, roomNumber, status, floor:{ floorNumber } }.
      // Normalise each chunk so the fallback derivation still works.
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
      {error && <div className="flex items-center gap-3 rounded-xl border border-error-container bg-error-container/20 px-4 py-3 text-sm text-on-error-container"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">ห้องทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-on-surface">{loading ? '...' : totalRooms}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">มีผู้เช่า</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700">{loading ? '...' : occupied}</p>
          <p className="mt-1 text-xs text-on-surface-variant">{pct(occupied, totalRooms)}%</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">ว่าง</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{loading ? '...' : vacant}</p>
          <p className="mt-1 text-xs text-on-surface-variant">{pct(vacant, totalRooms)}%</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">ซ่อมบำรุง</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{loading ? '...' : maintenance}</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">อัตราการเข้าพัก</p>
          <p className={`mt-1 text-2xl font-bold ${rateColor(occupancyRate)}`}>{loading ? '...' : `${occupancyRate}%`}</p>
        </div>
      </div>

      {/* Floor table + distribution */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <span className="text-sm font-semibold text-on-surface">ความครอบคลุมตามชั้น</span>
            <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">{byFloor.length} ชั้น</span>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">ชั้น</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-on-surface-variant">ทั้งหมด</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-on-surface-variant">มีผู้เช่า</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-on-surface-variant">ว่าง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-on-surface-variant">ซ่อมบำรุง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">อัตรา</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant">กำลังโหลด...</td></tr>
                  : byFloor.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant">ไม่มีข้อมูล</td></tr>
                  : byFloor.map((fl) => {
                    const rate = fl.occupancyRate ?? pct(fl.occupied, fl.total);
                    return (
                      <tr key={fl.floorNumber} className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-on-surface">ชั้น {fl.floorNumber}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-on-surface">{fl.total}</td>
                        <td className="px-4 py-3 text-right font-semibold text-indigo-700 tabular-nums">{fl.occupied}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700 tabular-nums">{fl.vacant}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-700 tabular-nums">{fl.maintenance ?? 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-container">
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
        </section>

        {/* Status distribution */}
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-sm font-semibold text-on-surface mb-4">สถานะห้อง</div>
          {loading ? <div className="py-8 text-center text-sm text-on-surface-variant">กำลังโหลด...</div> : (
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
                        <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-sm ${cfg.bar}`} /><span className="font-medium text-on-surface">{cfg.label}</span></div>
                        <div className="flex items-center gap-2 tabular-nums"><span className={`font-semibold ${cfg.text}`}>{count}</span><span className="text-on-surface-variant">·</span><span className="text-on-surface-variant">{rate}%</span></div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container"><div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${rate}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-outline-variant pt-3">
                <span className="text-sm font-semibold text-on-surface">รวม</span>
                <span className="text-lg font-bold text-on-surface tabular-nums">{totalRooms}</span>
              </div>
            </div>
          )}
        </section>
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

      // Fetch ALL overdue invoices (aging analysis must cover every row, not
      // just the first page) by looping through pages until exhausted.
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
        if (page > 100) break; // safety stop (>10k overdue)
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
      {error && <div className="flex items-center gap-3 rounded-xl border border-error-container bg-error-container/20 px-4 py-3 text-sm text-on-error-container"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {/* Date filter */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-on-surface">ช่วงวันที่:</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant">จาก</span>
            <select value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {MONTHS.map((m) => <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}</option>)}
            </select>
            <select value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-on-surface-variant">ถึง</span>
            <select value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {MONTHS.map((m) => <option key={m} value={m}>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]}</option>)}
            </select>
            <select value={toYear} onChange={(e) => setToYear(Number(e.target.value))}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <span className="text-xs text-on-surface-variant">{rows.length} เดือน</span>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">ออกใบแจ้งทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-on-surface">{loading ? '...' : money(summary.totalInvoiced)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">ในช่วงที่เลือก</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">เก็บได้ทั้งหมด</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{loading ? '...' : money(summary.totalCollected)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">ได้รับชำระ</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">อัตราการเก็บ</p>
          <p className={`mt-1 text-2xl font-bold ${rateColor(summary.collectionRate)}`}>{loading ? '...' : `${summary.collectionRate}%`}</p>
          <p className="mt-1 text-xs text-on-surface-variant">เก็บ / ออกใบแจ้ง</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">ค้างชำระ</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{loading ? '...' : money(summary.totalOutstanding)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">ยอดคงค้าง</p>
        </div>
      </div>

      {/* Month table */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
          <span className="text-sm font-semibold text-on-surface">รายเดือน</span>
          <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface-variant">{rows.length} เดือน</span>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">เดือน</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-on-surface-variant">ออกใบแจ้ง</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-on-surface-variant">เก็บได้</th>
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-on-surface-variant">ค้างชำระ</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">อัตราเก็บ</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant">กำลังโหลด...</td></tr>
                : rows.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant">ไม่มีข้อมูล</td></tr>
                : rows.map((row) => {
                  const sl = statusLabel(row.collectionRate);
                  return (
                    <tr key={`${row.year}-${row.month}`} className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-on-surface">{monthLabel(row.year, row.month)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-on-surface">{money(row.invoiced)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums">{money(row.collected)}</td>
                      <td className="px-4 py-3 text-right"><span className={row.outstanding > 0 ? 'tabular-nums font-medium text-red-600' : 'text-on-surface-variant'}>{money(row.outstanding)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-container">
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
      </section>

      {/* Aging analysis */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-semibold text-on-surface">วิเคราะห์หนี้ค้าง</div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-error-container" />
            <span className="text-sm text-on-surface-variant">{overdueInvoices.length} ใบแจ้งหนี้เกินกำหนด</span>
          </div>
        </div>
        {loading ? <div className="py-8 text-center text-sm text-on-surface-variant">กำลังโหลด...</div> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {agingBuckets.map((bucket) => {
              const barPct = maxAgingAmount > 0 ? (bucket.amount / maxAgingAmount) * 100 : 0;
              const isSerious = bucket.days === '90+';
              return (
                <div key={bucket.days} className={`rounded-2xl border p-4 ${isSerious ? 'border-error-container/30 bg-error-container/10' : 'border-outline-variant bg-surface-container'}`}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{bucket.label}</div>
                  <div className={`text-2xl font-bold tabular-nums ${isSerious ? 'text-on-error-container' : 'text-on-surface'}`}>{money(bucket.amount)}</div>
                  <div className="mt-1 text-xs text-on-surface-variant">{bucket.count} ใบแจ้งหนี้</div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-lowest">
                    <div className={`h-full rounded-full transition-all ${isSerious ? 'bg-error-container' : 'bg-on-surface-variant/30'}`} style={{ width: `${barPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && overdueInvoices.length === 0 && (
          <p className="mt-2 rounded-2xl border border-tertiary-container/30 bg-tertiary-container/10 px-4 py-3 text-sm text-on-tertiary-container">ไม่มีใบแจ้งหนี้เกินกำหนด ทุกรายการชำระครบแล้ว</p>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AdminReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <BarChart2 className="h-5 w-5 text-on-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-on-primary">รายงาน</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">ภาพรวมรายงานทางการเงิน สถานะห้อง และกิจกรรมระบบ</p>
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-white/30">
            <RefreshCw className="h-4 w-4" />รีเฟรช
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="inline-flex items-center gap-1 rounded-xl bg-surface-container p-1">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={['px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'].join(' ')}>
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
