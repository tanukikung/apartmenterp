'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  TrendingUp,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type OverdueInvoice = {
  id: string;
  invoiceNumber: string;
  dueDate: string;
  totalAmount: number;
  status: string;
  year?: number;
  month?: number;
  billingPeriodId?: string | null;
  roomBillingId?: string | null;
  room?: { roomNumber?: string; roomNo?: string } | null;
  tenant?: { id: string; fullName: string; phone: string } | null;
  tenantName?: string | null;
  roomNumber?: string;
  roomNo?: string;
};

type OverdueRange = 'all' | '1-30' | '31-60' | '60+';

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(amount);
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (isNaN(due.getTime())) return null;
  const now = new Date();
  const ms = now.getTime() - due.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return days > 0 ? days : null;
}

function daysOverdueBadge(days: number): string {
  if (days <= 30) return 'bg-amber-500/15 text-amber-600 border border-amber-500/30';
  if (days <= 60) return 'bg-orange-500/15 text-orange-600 border border-orange-500/30';
  return 'bg-red-500/15 text-red-600 border border-red-500/30';
}

function daysOverdueText(days: number): string {
  if (days <= 30) return 'text-amber-600';
  if (days <= 60) return 'text-orange-600';
  return 'text-red-600';
}

function tenantName(inv: OverdueInvoice): string {
  if (inv.tenantName) return inv.tenantName;
  if (inv.tenant?.fullName) return inv.tenant.fullName;
  return '—';
}

function roomNum(inv: OverdueInvoice): string {
  return inv.room?.roomNumber ?? inv.room?.roomNo ?? inv.roomNumber ?? inv.roomNo ?? '—';
}

function exportCsv(invoices: OverdueInvoice[]) {
  const header = ['Room', 'Tenant', 'Invoice #', 'Due Date', 'Days Overdue', 'Amount (THB)'];
  const rows = invoices.map((inv) => {
    const days = daysSince(inv.dueDate);
    const dueDateStr = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('th-TH') : '';
    return [roomNum(inv), tenantName(inv), inv.invoiceNumber ?? inv.id, dueDateStr, days !== null ? String(days) : '', String(inv.totalAmount)];
  });
  const csv = [header, ...rows].map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `overdue-invoices-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Glass Card ─────────────────────────────────────────────────────────────

function GlassCard({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={[
      'rounded-2xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]',
      'shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)]',
      hover ? 'hover:bg-[hsl(var(--color-surface))]/80 hover:shadow-[0_12px_40px_rgba(0,0,0,0.5),shadow-[0_0_20px_rgba(99,102,241,0.15)]] hover:scale-[1.01] transition-all duration-200 cursor-pointer' : '',
      className,
    ].join(' ')}>
      {children}
    </div>
  );
}

export default function AdminOverduePage() {
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<OverdueRange>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [overdueTotal, setOverdueTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch('/api/invoices?status=OVERDUE&pageSize=100')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const raw = json.data;
        const arr: OverdueInvoice[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setOverdueInvoices(arr);
        setOverdueTotal(raw?.total ?? arr.length);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let rows: OverdueInvoice[] = overdueInvoices;
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((inv) => roomNum(inv).toLowerCase().includes(q) || tenantName(inv).toLowerCase().includes(q) || (inv.invoiceNumber ?? inv.id).toLowerCase().includes(q));
    }
    if (range !== 'all') {
      rows = rows.filter((inv) => {
        const d = daysSince(inv.dueDate);
        if (d === null) return true;
        if (range === '1-30') return d >= 1 && d <= 30;
        if (range === '31-60') return d >= 31 && d <= 60;
        if (range === '60+') return d > 60;
        return true;
      });
    }
    return rows.sort((a, b) => {
      const da = daysSince(a.dueDate) ?? 0;
      const db = daysSince(b.dueDate) ?? 0;
      return db - da;
    });
  }, [overdueInvoices, search, range]);

  const kpi = useMemo(() => {
    const list: OverdueInvoice[] = overdueInvoices;
    const total = list.length;
    const totalAmount = list.reduce((s, inv) => s + inv.totalAmount, 0);
    const avgDays = total > 0 ? Math.round(list.reduce((s, inv) => s + (daysSince(inv.dueDate) ?? 0), 0) / total) : 0;
    const uniqueRooms = new Set(list.map((inv) => roomNum(inv))).size;
    return { total, totalAmount, avgDays, uniqueRooms };
  }, [overdueInvoices]);

  function refetch() {
    setIsLoading(true);
    fetch('/api/invoices?status=OVERDUE&pageSize=100')
      .then(r => r.json())
      .then(json => {
        const raw = json.data;
        const arr: OverdueInvoice[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setOverdueInvoices(arr);
        setOverdueTotal(raw?.total ?? arr.length);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }

  async function sendReminder(id: string) {
    setWorking(`remind:${id}`); setActionError(null); setMessage(null);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'LINE' }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถส่งการแจ้งเตือนได้');
      setMessage('ส่งการแจ้งเตือนผ่าน LINE แล้ว');
    } catch (err) { setActionError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งการแจ้งเตือน'); }
    finally { setWorking(null); }
  }

  async function sendAllReminders() {
    if (filtered.length === 0) return;
    setWorking('all'); setActionError(null); setMessage(null);
    let sent = 0; let failed = 0;
    for (const inv of filtered) {
      try {
        const res = await fetch(`/api/invoices/${inv.id}/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'LINE' }),
        }).then((r) => r.json());
        if (res.success) sent++; else failed++;
      } catch (err) {
        console.error('Failed to send reminder for invoice', inv.id, err);
        failed++;
      }
    }
    setWorking(null);
    setMessage(`ส่งการแจ้งเตือนแล้ว: ${sent} รายสำเร็จ${failed > 0 ? `, ${failed} ล้มเหลว` : ''}`);
  }

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/80 to-blue-700/60 px-6 py-5 shadow-[0_8px_32px_rgba(0,0,0,0.5),shadow-[0_0_20px_rgba(99,102,241,0.15)]]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.1),_transparent_60%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base font-semibold text-[hsl(var(--color-text))]">จัดการลูกหนี้ค้างชำระ</h1>
            <p className="mt-0.5 text-sm text-[hsl(var(--color-text))]/60">ติดตามและดำเนินการกับใบแจ้งหนี้ที่เกินกำหนด</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setConfirmOpen(true)} disabled={working === 'all' || filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-500/20 border border-blue-500/30 px-4 py-2 text-sm font-semibold text-blue-600 shadow-[0_0_16px_rgba(59,130,246,0.2)] transition-all hover:bg-blue-500/30 active:scale-95 disabled:opacity-60">
              <MessageCircle className="h-4 w-4" />
              {working === 'all' ? 'กำลังส่ง...' : `ส่งแจ้งเตือนทั้งหมด (${filtered.length})`}
            </button>
            <button onClick={() => exportCsv(filtered)}
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))] shadow-sm transition-all hover:bg-[hsl(var(--color-surface))]/80 active:scale-95">
              <Download className="h-4 w-4" />
              ส่งออก CSV
            </button>
            <button onClick={() => void refetch()} disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-3 py-2 text-sm font-medium text-[hsl(var(--color-text))] shadow-sm transition-all hover:bg-[hsl(var(--color-surface))]/80 active:scale-95">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {message && <GlassCard className="p-4"><div className="flex items-center gap-3 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div></GlassCard>}
      {actionError && <GlassCard className="p-4"><div className="flex items-center gap-3 text-sm text-red-600"><AlertTriangle className="h-4 w-4 shrink-0" />{actionError}</div></GlassCard>}
      <ConfirmDialog
        open={confirmOpen}
        title={`ส่ง Reminder ถึง ${filtered.length} รายการ?`}
        description="ระบบจะส่ง LINE reminder ไปยังทุกห้องที่ค้างชำระที่เชื่อม LINE ไว้ หากเคยส่งไปแล้วใน 24 ชม. จะถูกข้าม"
        confirmLabel="ส่งเลย"
        cancelLabel="ยกเลิก"
        onConfirm={() => { setConfirmOpen(false); void sendAllReminders(); }}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* KPI row */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--color-text))]/40">ลูกหนี้ค้างชำระ</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--color-text))]">{isLoading ? '...' : kpi.total}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--color-text))]/40">ยอดค้างชำระรวม</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{isLoading ? '...' : money(kpi.totalAmount)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.2)]">
              <TrendingUp className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--color-text))]/40">เฉลี่ยวันค้างชำระ</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--color-text))]">{isLoading ? '...' : kpi.avgDays}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.2)]">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--color-text))]/40">ห้องที่มีลูกหนี้</p>
              <p className="mt-1 text-2xl font-bold text-[hsl(var(--color-text))]">{isLoading ? '...' : kpi.uniqueRooms}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--color-text))]/40" />
            </div>
          </div>
        </GlassCard>
      </section>

      {/* Action bar */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--color-text))]/30" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาห้อง, ผู้เช่า, เลขใบแจ้งหนี้..."
            className="w-full rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 py-2.5 pl-9 pr-3 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text))]/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))] p-1">
          {(['all', '1-30', '31-60', '60+'] as OverdueRange[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all active:scale-95 ${
                range === r ? 'bg-blue-500/20 text-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.2)] border border-blue-500/30' : 'text-[hsl(var(--color-text))]/40 hover:bg-white/5 hover:text-[hsl(var(--color-text))]/70'
              }`}>
              {r === 'all' ? 'ทั้งหมด' : r === '60+' ? '60วัน+' : `${r} วัน`}
            </button>
          ))}
        </div>
      </section>

      {/* Overdue table */}
      <GlassCard>
        <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))]/50 px-4 py-3">
          <span className="text-sm font-semibold text-[hsl(var(--color-text))]">ใบแจ้งหนี้เกินกำหนด</span>
          <span className="inline-flex items-center rounded-full bg-red-500/15 border border-red-500/30 px-2.5 py-0.5 text-xs font-semibold text-red-600">{filtered.length} ใบ</span>
        </div>

        {!isLoading && overdueInvoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="text-lg font-semibold text-[hsl(var(--color-text))]">ไม่มีลูกหนี้!</p>
            <p className="text-sm text-[hsl(var(--color-text))]/40">ไม่มีใบแจ้งหนี้ค้างชำระในขณะนี้</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--color-border))]/50">
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">ห้อง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">ผู้เช่า</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">เลขใบแจ้งหนี้</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">วันครบกำหนด</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">วันค้างชำระ</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">จำนวน (บาท)</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/30">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[hsl(var(--color-text))]/40">กำลังโหลดใบแจ้งหนี้ค้างชำระ...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[hsl(var(--color-text))]/40">ไม่พบใบแจ้งหนี้ค้างชำระที่ตรงกับการค้นหา</td></tr>
                ) : (
                  filtered.map((inv) => {
                    const days = daysSince(inv.dueDate);
                    return (
                      <tr key={inv.id} className="border-b border-[hsl(var(--color-border))]/50 hover:bg-[hsl(var(--color-surface))] transition-colors">
                        <td className="px-4 py-3 font-semibold text-[hsl(var(--color-text))]">{roomNum(inv)}</td>
                        <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">{tenantName(inv)}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-medium text-blue-600">{inv.invoiceNumber ?? inv.id.slice(0, 8)}</span>
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]"><ClientOnly fallback="-">{new Date(inv.dueDate).toLocaleDateString('th-TH')}</ClientOnly></td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${daysOverdueBadge(days ?? 0)}`}>
                            <Clock className={`h-3 w-3 ${daysOverdueText(days ?? 0)}`} />
                            {days}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-red-600">{money(inv.totalAmount)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => void sendReminder(inv.id)} disabled={working === `remind:${inv.id}` || working === 'all'}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-text))]/70 transition-colors hover:bg-[hsl(var(--color-surface))]/80 disabled:opacity-40 active:scale-95">
                              <Send className="h-3.5 w-3.5" />
                              {working === `remind:${inv.id}` ? 'กำลังส่ง...' : 'ส่งแจ้งเตือน'}
                            </button>
                            <Link href={inv.billingPeriodId ? `/admin/billing/${inv.billingPeriodId}?tab=invoices` : `/admin/invoices`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-text))]/70 transition-colors hover:bg-[hsl(var(--color-surface))]/80">
                              ดูใบแจ้งหนี้
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </main>
  );
}
