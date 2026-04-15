'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  XCircle,
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
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-on-primary">ศูนย์ประกาศและเตือน</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">
              ส่งข้อความเตือนค่าบริการหรือประกาศถึงลูกบ้าน
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/overdue" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
              ไปที่ Overdue
            </Link>
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-4">
          <div className="text-xs text-on-surface-variant font-medium">ค้างชำระทั้งหมด</div>
          <div className="text-xl font-semibold text-on-surface">{stats.total}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-4">
          <div className="text-xs text-on-surface-variant font-medium">มี LINE</div>
          <div className="text-xl font-semibold text-on-surface">{stats.withLine}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-4">
          <div className="text-xs text-on-surface-variant font-medium">ไม่มี LINE</div>
          <div className="text-xl font-semibold text-on-surface">{stats.withoutLine}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
            <div className="text-sm font-semibold text-on-surface">รายการค้างชำระ</div>
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <input
                type="checkbox"
                id="selectAll"
                checked={overdueInvoices.length > 0 && selectedIds.size === overdueInvoices.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedIds(new Set(overdueInvoices.map((i) => i.id)));
                  else setSelectedIds(new Set());
                }}
                className="h-4 w-4 rounded border-outline"
              />
              <label htmlFor="selectAll" className="cursor-pointer">เลือกทั้งหมด</label>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
            </div>
          ) : overdueInvoices.length === 0 ? (
            <div className="p-10 text-center text-on-surface-variant">
              ไม่พบใบแจ้งหนี้ค้างชำระ
            </div>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-container-lowest">
                  <tr>
                    <th></th>
                    <th>ห้อง</th>
                    <th>ยอดค้าง</th>
                    <th>ค้าง (วัน)</th>
                    <th>ผู้เช่า</th>
                    <th>LINE</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueInvoices.map((inv) => (
                    <tr key={inv.id} className={selectedIds.has(inv.id) ? 'bg-primary-container' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          className="h-4 w-4 rounded border-outline"
                        />
                      </td>
                      <td className="font-semibold">{inv.roomNo}</td>
                      <td>{money(inv.totalAmount)}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          inv.daysOverdue > 30
                            ? 'bg-red-100 text-red-700'
                            : inv.daysOverdue > 7
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {inv.daysOverdue} วัน
                        </span>
                      </td>
                      <td className="text-on-surface-variant">{inv.tenantName ?? '-'}</td>
                      <td>
                        {inv.lineUserId ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-on-surface-variant">
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

        <section className="space-y-4">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
              <div className="text-sm font-semibold text-on-surface">ส่ง Reminder</div>
            </div>
            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">ประเภทการส่ง</label>
                <select
                  value={sendType}
                  onChange={(e) => setSendType(e.target.value as 'OVERDUE' | 'DUE_SOON' | 'SELECTED')}
                  className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface w-full"
                >
                  <option value="OVERDUE">ค้างชำระทั้งหมด</option>
                  <option value="DUE_SOON">ใกล้ครบกำหนด (3 วัน)</option>
                  <option value="SELECTED">เลือกเฉพาะห้อง</option>
                </select>
              </div>

              {sendType === 'SELECTED' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-on-surface">เลือกชั้น</label>
                  <div className="flex flex-wrap gap-2">
                    {uniqueFloors.map((floor) => (
                      <button
                        key={floor}
                        onClick={() => toggleFloor(floor)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                          selectedFloors.includes(floor)
                            ? 'border-primary/30 bg-primary-container text-primary'
                            : 'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        ชั้น {floor}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    เลือก {selectedFloors.length} ชั้น
                  </p>
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-on-surface">ข้อความ (ถ้าว่างจะใช้ default)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="แจ้งเตือนค่าบริการ..."
                  rows={3}
                  className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant w-full"
                />
              </div>

              <div className="rounded-lg border border-color-warning/30 bg-warning-container p-3 text-sm text-on-warning-container">
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>ระบบจะข้ามผู้ที่ได้รับ reminder ใน 24 ชั่วโมงที่ผ่านมาแล้ว</span>
                </div>
              </div>

              <button
                onClick={() => void handleSend()}
                disabled={sending || (sendType === 'SELECTED' && selectedIds.size === 0)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary/90 flex w-full items-center justify-center gap-2"
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
            <div className="bg-success-container rounded-xl border border-color-success/30 overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <CheckCircle2 className="h-8 w-8 text-color-success" />
                <div>
                  <div className="font-semibold text-on-success-container">ส่งสำเร็จ</div>
                  <div className="text-sm text-on-success-container/80">
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
