'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
  Bell,
} from 'lucide-react';

type OverdueInvoice = {
  id: string;
  invoiceNumber: string;
  roomNo: string;
  floorNo: number;
  totalAmount: string;
  dueDate: string;
  daysOverdue: number;
  lastReminderAt: string | null;
  tenantName: string | null;
  lineUserId: string | null;
};

type BroadcastResult = {
  totalInvoices: number;
  sent: number;
  skipped: number;
  errors: number;
};

function money(amount: string): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(parseFloat(amount));
}

export default function BroadcastPage() {
  const { toast } = useToast();
  const [overdueInvoices, setOverdueInvoices] = useState<OverdueInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [sendType, setSendType] = useState<'OVERDUE' | 'DUE_SOON' | 'SELECTED'>('OVERDUE');
  const [selectedFloors, setSelectedFloors] = useState<number[]>([]);
  const [message, setMessage] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Warn on unload if user has an unsent message drafted
  useUnsavedChanges(message.trim().length > 0 && !sending);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/invoices?status=OVERDUE&pageSize=200', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถโหลดข้อมูล');
      const now = new Date();
      const items = (json.data?.items ?? json.data ?? []).map((inv: Record<string, unknown>) => {
        const dueDate = new Date(inv.dueDate as string);
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const tenant = (inv as Record<string, unknown>).tenant as { firstName?: string; lastName?: string; lineUserId?: string | null } | null;
        return {
          id: inv.id as string,
          invoiceNumber: inv.invoiceNumber as string ?? `INV-${inv.year}-${inv.month}-${inv.roomNo}`,
          roomNo: inv.roomNo as string,
          floorNo: (inv as Record<string, unknown>).room ? ((inv as Record<string, unknown>).room as { floorNo?: number }).floorNo ?? 0 : 0,
          totalAmount: (inv.totalAmount as { toString(): string }).toString(),
          dueDate: inv.dueDate as string,
          daysOverdue: Math.max(0, daysOverdue),
          lastReminderAt: null,
          tenantName: tenant ? `${tenant.firstName ?? ''} ${tenant.lastName ?? ''}`.trim() : null,
          lineUserId: tenant?.lineUserId ?? null,
        };
      });
      setOverdueInvoices(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSend() {
    if (selectedIds.size === 0 && sendType === 'SELECTED') {
      toast('กรุณาเลือกใบแจ้งหนี้ที่ต้องการส่ง', 'warning');
      return;
    }

    setSending(true);
    setResult(null);
    setError(null);

    try {
      const payload: Record<string, unknown> = {};

      if (sendType === 'SELECTED') {
        payload.invoiceIds = Array.from(selectedIds);
      } else if (sendType === 'DUE_SOON') {
        payload.sendType = 'DUE_SOON';
      } else {
        payload.sendType = 'OVERDUE';
      }

      if (selectedFloors.length > 0) {
        payload.floorNumbers = selectedFloors;
      }

      if (message) {
        payload.message = message;
      }

      const res = await fetch('/api/reminders/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'ส่งไม่สำเร็จ');
      setResult(json.data as BroadcastResult);
      setSelectedIds(new Set());
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function toggleFloor(floor: number) {
    setSelectedFloors((prev) =>
      prev.includes(floor) ? prev.filter((f) => f !== floor) : [...prev, floor]
    );
  }

  const stats = {
    total: overdueInvoices.length,
    withLine: overdueInvoices.filter((i) => i.lineUserId).length,
    withoutLine: overdueInvoices.filter((i) => !i.lineUserId).length,
  };

  const uniqueFloors = Array.from(new Set(overdueInvoices.map((i) => i.floorNo))).sort((a, b) => a - b);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur px-6 py-5 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary))]/10 to-transparent pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-[hsl(var(--primary))]/8 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--primary))]/10 shadow-[var(--glow-primary)]">
              <Bell className="h-5 w-5 text-[hsl(var(--primary))]" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight text-[hsl(var(--card-foreground))]">ศูนย์ประกาศและเตือน</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">ส่งข้อความเตือนค่าบริการหรือประกาศถึงลูกบ้าน</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/overdue" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface-variant))] backdrop-blur-sm transition-all hover:border-[hsl(var(--primary))]/30 hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 active:scale-[0.98]">
              ไปที่ Overdue
            </Link>
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface-variant))] backdrop-blur-sm transition-all hover:border-[hsl(var(--primary))]/30 hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 active:scale-[0.98]">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-[hsl(0,72%,55%,0.3)] bg-[hsl(0,72%,55%,0.1)] px-4 py-3 text-sm text-[hsl(0,72%,90%)] backdrop-blur-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="group relative overflow-hidden rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] p-4 transition-all hover:border-[hsl(var(--primary))]/30">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary))]/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="text-xs text-[hsl(var(--on-surface-variant))] font-medium">ค้างชำระทั้งหมด</div>
            <div className="text-2xl font-semibold text-[hsl(var(--card-foreground))] mt-1 font-display tracking-tight">{stats.total}</div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] p-4 transition-all hover:border-[hsl(var(--emerald))]/30">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="text-xs text-[hsl(var(--on-surface-variant))] font-medium">มี LINE</div>
            <div className="text-2xl font-semibold text-[hsl(var(--card-foreground))] mt-1 font-display tracking-tight">{stats.withLine}</div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] p-4 transition-all hover:border-red-500/30">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <div className="text-xs text-[hsl(var(--on-surface-variant))] font-medium">ไม่มี LINE</div>
            <div className="text-2xl font-semibold text-[hsl(var(--card-foreground))] mt-1 font-display tracking-tight">{stats.withoutLine}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Invoice list */}
        <section className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden transition-all hover:border-[hsl(var(--primary))]/30">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--glass-border))]">
            <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">รายการค้างชำระ</div>
            <div className="flex items-center gap-3 text-sm">
              <label htmlFor="selectAll" className="cursor-pointer text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))] transition-colors">เลือกทั้งหมด</label>
              <input
                type="checkbox"
                id="selectAll"
                checked={overdueInvoices.length > 0 && selectedIds.size === overdueInvoices.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedIds(new Set(overdueInvoices.map((i) => i.id)));
                  else setSelectedIds(new Set());
                }}
                className="h-4 w-4 rounded border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] cursor-pointer accent-[hsl(var(--primary))]"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--on-surface-variant))]" />
            </div>
          ) : overdueInvoices.length === 0 ? (
            <div className="p-10 text-center text-sm text-[hsl(var(--on-surface-variant))]">ไม่พบใบแจ้งหนี้ค้างชำระ</div>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[hsl(var(--card))]">
                  <tr className="text-[hsl(var(--on-surface-variant))] text-xs uppercase tracking-wider">
                    <th className="w-10 pl-4 pr-2 py-3 text-left"></th>
                    <th className="px-3 py-3 text-left font-medium">ห้อง</th>
                    <th className="px-3 py-3 text-left font-medium">ยอดค้าง</th>
                    <th className="px-3 py-3 text-left font-medium">ค้าง (วัน)</th>
                    <th className="px-3 py-3 text-left font-medium">ผู้เช่า</th>
                    <th className="px-3 py-3 text-left font-medium">LINE</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.map((inv) => (
                    <tr key={inv.id} className={`border-t border-[hsl(var(--glass-border))] transition-colors ${selectedIds.has(inv.id) ? 'bg-[hsl(var(--primary))]/8' : 'hover:bg-[hsl(var(--primary))]/5'}`}>
                      <td className="pl-4 pr-2 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          className="h-4 w-4 rounded border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] cursor-pointer accent-[hsl(var(--primary))]"
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold text-[hsl(var(--card-foreground))]">{inv.roomNo}</td>
                      <td className="px-3 py-3 text-[hsl(var(--on-surface-variant))]">{money(inv.totalAmount)}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          inv.daysOverdue > 30
                            ? 'border-[hsl(0,72%,55%,0.3)] bg-[hsl(0,72%,55%,0.1)] text-[hsl(0,72%,90%)]'
                            : inv.daysOverdue > 7
                            ? 'border-[hsl(38,92%,55%,0.3)] bg-[hsl(38,92%,55%,0.1)] text-[hsl(38,92%,80%)]'
                            : 'border-[hsl(38,92%,55%,0.2)] bg-[hsl(38,92%,55%,0.05)] text-[hsl(38,92%,60%)]'
                        }`}>
                          {inv.daysOverdue} วัน
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[hsl(var(--on-surface-variant))]">{inv.tenantName ?? '-'}</td>
                      <td className="px-3 py-3">
                        {inv.lineUserId ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[hsl(var(--on-surface-variant))]/30">
                            <XCircle className="h-4 w-4" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Send panel */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] backdrop-blur shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden transition-all hover:border-[hsl(var(--primary))]/30">
            <div className="px-4 py-3 border-b border-[hsl(var(--glass-border))]">
              <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">ส่ง Reminder</div>
            </div>
            <div className="space-y-5 p-4">
              {/* Send type */}
              <div>
                <label className="mb-2 block text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wider">ประเภทการส่ง</label>
                <div className="relative">
                  <select
                    value={sendType}
                    onChange={(e) => {
                      const val = e.target.value as 'OVERDUE' | 'DUE_SOON' | 'SELECTED';
                      setSendType(val);
                      if (val !== 'SELECTED') setSelectedFloors([]);
                    }}
                    className="w-full appearance-none rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all cursor-pointer"
                  >
                    <option value="OVERDUE" className="bg-[hsl(var(--card))]">ค้างชำระทั้งหมด</option>
                    <option value="DUE_SOON" className="bg-[hsl(var(--card))]">ใกล้ครบกำหนด (3 วัน)</option>
                    <option value="SELECTED" className="bg-[hsl(var(--card))]">เลือกเฉพาะห้อง</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[hsl(var(--on-surface-variant))]">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              </div>

              {sendType === 'SELECTED' ? (
                <div>
                  <label className="mb-2 block text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wider">เลือกชั้น</label>
                  <div className="flex flex-wrap gap-2">
                    {uniqueFloors.map((floor) => (
                      <button
                        key={floor}
                        onClick={() => toggleFloor(floor)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                          selectedFloors.includes(floor)
                            ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] shadow-[var(--glow-primary)]'
                            : 'border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] text-[hsl(var(--on-surface-variant))] hover:border-[hsl(var(--primary))]/30 hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/5 active:scale-[0.98]'
                        }`}
                      >
                        ชั้น {floor}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[hsl(var(--on-surface-variant))]">เลือก {selectedFloors.length} ชั้น</p>
                </div>
              ) : null}

              {/* Message */}
              <div>
                <label className="mb-2 block text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wider">ข้อความ (ถ้าว่างจะใช้ default)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="แจ้งเตือนค่าบริการ..."
                  rows={3}
                  className="w-full rounded-xl border border-[hsl(var(--glass-border))] bg-[hsl(var(--card))] px-4 py-3 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all resize-none"
                />
              </div>

              {/* Info notice */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span className="text-xs text-[hsl(var(--on-surface-variant))]">ระบบจะข้ามผู้ที่ได้รับ reminder ใน 24 ชั่วโมงที่ผ่านมาแล้ว</span>
                </div>
              </div>

              {/* Send button */}
              <button
                onClick={() => void handleSend()}
                disabled={sending || (sendType === 'SELECTED' && selectedIds.size === 0)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/10 w-full px-4 py-3 text-sm font-semibold text-[hsl(var(--primary))] shadow-[var(--glow-primary)] transition-all hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--primary))]/20 hover:shadow-[var(--glow-primary)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? 'กำลังส่ง...' : 'ส่ง Reminder'}
              </button>
            </div>
          </div>

          {result && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="font-semibold text-emerald-600">ส่งสำเร็จ</div>
                  <div className="text-sm text-emerald-600/80">
                    ส่ง {result.sent} / {result.totalInvoices} รายการ
                    {result.skipped > 0 && ` (ข้าม ${result.skipped} ราย - cooldown 24 ชม.)`}
                    {result.errors > 0 && ` (ผิดพลาด ${result.errors} ราย)`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
