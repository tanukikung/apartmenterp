'use client';

import { useMemo, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  MessageCircle,
  RefreshCw,
  Send,
  TrendingUp,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useApiData } from '@/hooks/useApi';

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
  if (days <= 30) return 'bg-amber-100 text-amber-800 border border-amber-200';
  if (days <= 60) return 'bg-orange-100 text-orange-800 border border-orange-200';
  return 'bg-[var(--error-container)] text-[var(--on-error-container)] border border-[var(--error-container)]/30';
}

function daysOverdueText(days: number): string {
  if (days <= 30) return 'text-amber-700';
  if (days <= 60) return 'text-orange-700';
  return 'text-[var(--on-error-container)]';
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

export default function AdminOverduePage() {
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<OverdueRange>('all');
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: overdueData, isLoading, error: fetchError, refetch } = useApiData<{ success: boolean; data?: { data: OverdueInvoice[] } }>('/api/invoices?status=OVERDUE&pageSize=100', ['overdue-invoices']);

  const invoices: OverdueInvoice[] = overdueData?.data?.data ?? [];

  const filtered = useMemo(() => {
    let rows = invoices;
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
  }, [invoices, search, range]);

  const kpi = useMemo(() => {
    const total = invoices.length;
    const totalAmount = invoices.reduce((s, inv) => s + inv.totalAmount, 0);
    const avgDays = total > 0 ? Math.round(invoices.reduce((s, inv) => s + (daysSince(inv.dueDate) ?? 0), 0) / total) : 0;
    const uniqueRooms = new Set(invoices.map((inv) => roomNum(inv))).size;
    return { total, totalAmount, avgDays, uniqueRooms };
  }, [invoices]);

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
        // Network errors are counted and surfaced in the summary message — no need to throw
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--on-surface)]">จัดการลูกหนี้ค้างชำระ</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">ติดตามและดำเนินการกับใบแจ้งหนี้ที่เกินกำหนด</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setConfirmOpen(true)} disabled={working === 'all' || filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60">
            <MessageCircle className="h-4 w-4" />
            {working === 'all' ? 'กำลังส่ง...' : `ส่งแจ้งเตือนทั้งหมด (${filtered.length})`}
          </button>
          <button onClick={() => exportCsv(filtered)}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]">
            <Download className="h-4 w-4" />
            ส่งออก CSV
          </button>
          <button onClick={() => void refetch()} disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {message && <div className="flex items-center gap-3 rounded-xl border border-[var(--tertiary-container)] bg-[var(--tertiary-container)]/20 px-4 py-3 text-sm text-[var(--on-tertiary-container)]"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</div>}
      {actionError && <div className="flex items-center gap-3 rounded-xl border border-[var(--error-container)] bg-[var(--error-container)]/20 px-4 py-3 text-sm text-[var(--on-error-container)]"><AlertTriangle className="h-4 w-4 shrink-0" />{actionError}</div>}
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
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">ลูกหนี้ค้างชำระ</p>
              <p className="mt-1 text-2xl font-bold text-[var(--on-surface)]">{isLoading ? '...' : kpi.total}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--error-container)]/30 bg-[var(--error-container)]/10">
              <AlertTriangle className="h-5 w-5 text-[var(--on-error-container)]" />
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">ยอดค้างชำระรวม</p>
              <p className="mt-1 text-2xl font-bold text-[var(--on-error-container)]">{isLoading ? '...' : money(kpi.totalAmount)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-100">
              <TrendingUp className="h-5 w-5 text-amber-700" />
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">เฉลี่ยวันค้างชำระ</p>
              <p className="mt-1 text-2xl font-bold text-[var(--on-surface)]">{isLoading ? '...' : kpi.avgDays}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-100">
              <Clock className="h-5 w-5 text-amber-700" />
            </div>
          </div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-5 hover:shadow-lg transition-all">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">ห้องที่มีลูกหนี้</p>
              <p className="mt-1 text-2xl font-bold text-[var(--on-surface)]">{isLoading ? '...' : kpi.uniqueRooms}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)]">
              <AlertTriangle className="h-5 w-5 text-[var(--on-surface-variant)]" />
            </div>
          </div>
        </div>
      </section>

      {/* Action bar */}
      <section className="flex flex-wrap items-center gap-3">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาห้อง, ผู้เช่า, เลขใบแจ้งหนี้..."
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] py-2 px-4 text-sm text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]/50 focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20" />
        <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-container)] p-1">
          {(['all', '1-30', '31-60', '60+'] as OverdueRange[]).map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                range === r ? 'bg-[var(--surface-container-lowest)] text-[var(--primary)] shadow-sm' : 'text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-low)] hover:text-[var(--on-surface)]'
              }`}>
              {r === 'all' ? 'ทั้งหมด' : r === '60+' ? '60วัน+' : `${r} วัน`}
            </button>
          ))}
        </div>
      </section>

      {/* Overdue table */}
      <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--outline-variant)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--on-surface)]">ใบแจ้งหนี้เกินกำหนด</span>
          <span className="inline-flex items-center rounded-full bg-[var(--error-container)] px-2.5 py-0.5 text-xs font-semibold text-[var(--on-error-container)]">{filtered.length} ใบ</span>
        </div>

        {!isLoading && invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--tertiary-container)]/20">
              <CheckCircle2 className="h-7 w-7 text-[var(--on-tertiary-container)]" />
            </div>
            <p className="text-lg font-semibold text-[var(--on-surface)]">ไม่มีลูกหนี้!</p>
            <p className="text-sm text-[var(--on-surface-variant)]">ไม่มีใบแจ้งหนี้ค้างชำระในขณะนี้</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--outline-variant)]">
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">ห้อง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">ผู้เช่า</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">เลขใบแจ้งหนี้</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">วันครบกำหนด</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">วันค้างชำระ</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">จำนวน (บาท)</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--on-surface-variant)]">กำลังโหลดใบแจ้งหนี้ค้างชำระ...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-[var(--on-surface-variant)]">ไม่พบใบแจ้งหนี้ค้างชำระที่ตรงกับการค้นหา</td></tr>
                ) : (
                  filtered.map((inv) => {
                    const days = daysSince(inv.dueDate);
                    return (
                      <tr key={inv.id} className="border-b border-[var(--outline-variant)]/5 hover:bg-[var(--surface-container)]/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-[var(--on-surface)]">{roomNum(inv)}</td>
                        <td className="px-4 py-3 text-[var(--on-surface-variant)]">{tenantName(inv)}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-medium text-[var(--primary)]">{inv.invoiceNumber ?? inv.id.slice(0, 8)}</span>
                        </td>
                        <td className="px-4 py-3 text-[var(--on-surface-variant)]"><ClientOnly fallback="-">{new Date(inv.dueDate).toLocaleDateString('th-TH')}</ClientOnly></td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${daysOverdueBadge(days ?? 0)}`}>
                            <Clock className={`h-3 w-3 ${daysOverdueText(days ?? 0)}`} />
                            {days}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-[var(--on-error-container)]">{money(inv.totalAmount)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => void sendReminder(inv.id)} disabled={working === `remind:${inv.id}` || working === 'all'}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)] disabled:opacity-60">
                              <Send className="h-3.5 w-3.5" />
                              {working === `remind:${inv.id}` ? 'กำลังส่ง...' : 'ส่งแจ้งเตือน'}
                            </button>
                            <Link href={inv.billingPeriodId ? `/admin/billing/${inv.billingPeriodId}?tab=invoices` : `/admin/invoices`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-1.5 text-xs font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]">
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
      </div>
    </main>
  );
}
