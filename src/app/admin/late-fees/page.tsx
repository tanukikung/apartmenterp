'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, ThumbsUp, X } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';


type LateFeeInvoice = {
  id: string;
  roomNo: string;
  year: number;
  month: number;
  status: string;
  totalAmount: number;
  lateFeeAmount: number;
  lateFeeAppliedAt: string | null;
  dueDate: string;
  paidAt: string | null;
  roomStatus: string;
  tenants: Array<{ firstName: string; lastName: string }>;
  rule: {
    penaltyPerDay: number;
    maxPenalty: number;
    gracePeriodDays: number;
  } | null;
};

type LateFeeResponse = {
  invoices: LateFeeInvoice[];
  total: number;
  page: number;
  pageSize: number;
};

type EditState = {
  [invoiceId: string]: {
    lateFeeAmount: number;
    note?: string;
  };
};

function money(amount: number): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('th-TH');
}

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function monthLabel(year: number, month: number): string {
  return `${THAI_MONTHS[month - 1]} ${year}`;
}

export default function LateFeesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'OVERDUE' | 'PAID' | 'all'>('OVERDUE');
  const [roomSearch, setRoomSearch] = useState('');
  const [editState, setEditState] = useState<EditState>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchLateFees = useCallback(async (): Promise<LateFeeResponse> => {
    const params = new URLSearchParams();
    if (filter === 'all') {
      // no status filter
    } else {
      params.set('status', filter);
    }
    if (roomSearch) params.set('roomNo', roomSearch);
    params.set('pageSize', '100');

    const res = await fetch(`/api/late-fees?${params}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? 'Failed to fetch');
    return json.data;
  }, [filter, roomSearch]);

  const { data, isLoading, error, refetch } = useQuery<LateFeeResponse>({
    queryKey: ['late-fees', filter, roomSearch],
    queryFn: fetchLateFees,
  });

  // Initialize edit state when data loads
  const initializeEditState = useCallback(() => {
    if (!data) return;
    const initial: EditState = {};
    for (const inv of data.invoices) {
      initial[inv.id] = { lateFeeAmount: inv.lateFeeAmount };
    }
    setEditState(initial);
  }, [data]);

  // Call initializeEditState when data changes
  useEffect(() => {
    initializeEditState();
  }, [initializeEditState]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data) return;
    if (selectedIds.size === data.invoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.invoices.map((inv) => inv.id)));
    }
  };

  const handleAmountChange = (invoiceId: string, value: number) => {
    setEditState((prev) => ({
      ...prev,
      [invoiceId]: { ...prev[invoiceId], lateFeeAmount: value },
    }));
  };

  const handleBulkApprove = async () => {
    if (!data || selectedIds.size === 0) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updates = Array.from(selectedIds).map((id) => {
        const inv = data.invoices.find((i) => i.id === id)!;
        return {
          invoiceId: id,
          lateFeeAmount: inv.lateFeeAmount, // approve current amount
          note: 'Approved by admin',
        };
      });
      const res = await fetch('/api/late-fees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, actorId: 'admin' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'Failed to save');
      setSaveSuccess(true);
      setSelectedIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ['late-fees'] });
    } catch (_err) {
      void _err;
      void refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!data) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const updates = data.invoices
        .filter((inv) => editState[inv.id]?.lateFeeAmount !== inv.lateFeeAmount)
        .map((inv) => ({
          invoiceId: inv.id,
          lateFeeAmount: editState[inv.id]?.lateFeeAmount ?? inv.lateFeeAmount,
        }));
      if (updates.length === 0) {
        setSaveSuccess(true);
        return;
      }
      const res = await fetch('/api/late-fees', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, actorId: 'admin' }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'Failed to save');
      setSaveSuccess(true);
      void queryClient.invalidateQueries({ queryKey: ['late-fees'] });
    } catch (_err) {
      void _err;
      void refetch();
    } finally {
      setSaving(false);
    }
  };

  const stats = data ? {
    overdue: data.invoices.filter((i) => i.status === 'OVERDUE').length,
    paid: data.invoices.filter((i) => i.status === 'PAID').length,
    totalLateFees: data.invoices.reduce((sum, i) => sum + (editState[i.id]?.lateFeeAmount ?? i.lateFeeAmount), 0),
    totalRooms: new Set(data.invoices.map((i) => i.roomNo)).size,
  } : null;

  const hasChanges = data?.invoices.some(
    (inv) => editState[inv.id]?.lateFeeAmount !== inv.lateFeeAmount
  ) ?? false;

  useUnsavedChanges(hasChanges);

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[hsl(var(--primary))]/20 to-[hsl(var(--primary))]/5 border border-[hsl(var(--color-border))] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[hsl(var(--color-text))]">ตรวจสอบค่าปรับล่าช้า</h1>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
              ตรวจสอบและอนุมัติค่าปรับล่าช้าที่คำนวณจากระบบรายคืน
            </p>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))]/70 shadow-sm transition-all hover:bg-[hsl(var(--color-surface))]/80 hover:border-[hsl(var(--color-border))]/80 active:scale-[0.98]"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {saveSuccess ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          บันทึกค่าปรับล่าช้าเรียบร้อยแล้ว
        </div>
      ) : null}

      {/* Stats */}
      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">ใบแจ้งหนี้ค้างชำระ</div>
            <div className="mt-2 text-2xl font-extrabold text-[hsl(var(--color-text))]">{stats.overdue}</div>
          </div>
          <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">ใบแจ้งหนี้ที่ชำระแล้ว</div>
            <div className="mt-2 text-2xl font-extrabold text-emerald-600">{stats.paid}</div>
          </div>
          <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">รวมค่าปรับล่าช้า</div>
            <div className="mt-2 text-2xl font-extrabold text-[hsl(var(--color-text))]">{money(stats.totalLateFees)}</div>
          </div>
          <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">จำนวนห้องที่ได้รับผลกระทบ</div>
            <div className="mt-2 text-2xl font-extrabold text-[hsl(var(--color-text))]">{stats.totalRooms}</div>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-1">
          {(['OVERDUE', 'PAID', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.98] ${
                filter === f
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--color-text))] shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                  : 'text-[hsl(var(--on-surface-variant))] hover:bg-[hsl(var(--color-surface))]/50 hover:text-[hsl(var(--color-text))]'
              }`}
            >
              {f === 'all' ? 'ทั้งหมด' : f === 'OVERDUE' ? 'ค้างชำระ' : 'ชำระแล้ว'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--color-text))]/30 pointer-events-none" />
          <input
            type="text"
            placeholder="ค้นหาห้อง..."
            value={roomSearch}
            onChange={(e) => setRoomSearch(e.target.value)}
            className="h-9 w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] pl-9 pr-4 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text))]/30 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          />
        </div>
        {roomSearch && (
          <button onClick={() => setRoomSearch('')} className="text-sm text-[hsl(var(--primary))] hover:underline">
            ล้าง
          </button>
        )}

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--on-surface-variant))]">เลือกแล้ว {selectedIds.size} รายการ</span>
            <button
              onClick={() => void handleBulkApprove()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-text))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
              อนุมัติที่เลือก
            </button>
          </div>
        )}

        {hasChanges && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-amber-600">Unsaved changes</span>
            <button
              onClick={() => void handleSaveAll()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-text))] shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] active:scale-[0.98]"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              บันทึกทั้งหมด
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <section className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
          </div>
        ) : data && data.invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            <p className="text-[hsl(var(--on-surface-variant))]">ไม่มีใบแจ้งหนี้ค้างชำระที่มีค่าปรับล่าช้า</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-[hsl(var(--color-surface))]/50">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={data ? selectedIds.size === data.invoices.length && data.invoices.length > 0 : false}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]/20 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">ห้อง</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">รอบบิล</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">วันครบกำหนด</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">ค่าค้างชำระ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">ค่าปรับล่าช้า</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">กฏค่าปรับ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/40">ปรับแต่ง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data?.invoices.map((inv) => {
                  const isEdited = editState[inv.id]?.lateFeeAmount !== inv.lateFeeAmount;
                  const daysOverdue = Math.floor(
                    (Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-[hsl(var(--color-surface))] transition-colors ${
                        isEdited ? 'bg-amber-500/5' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          className="h-4 w-4 rounded border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]/20 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[hsl(var(--color-text))]">{inv.roomNo}</div>
                        <div className="text-xs text-[hsl(var(--color-text))]/40">
                          {inv.tenants.map((t) => `${t.firstName} ${t.lastName}`).join(', ') || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--color-text))]">
                        {monthLabel(inv.year, inv.month)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          inv.status === 'OVERDUE'
                            ? 'bg-red-500/20 text-red-600 border border-red-500/30'
                            : 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30'
                        }`}>
                          {inv.status === 'OVERDUE' ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {inv.status === 'OVERDUE' ? 'ค้างชำระ' : 'ชำระแล้ว'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[hsl(var(--color-text))]">{formatDate(inv.dueDate)}</div>
                        <div className={`text-xs ${daysOverdue > 0 ? 'text-red-600 font-medium' : 'text-[hsl(var(--color-text))]/40'}`}>
                          {daysOverdue > 0 ? `${daysOverdue} วัน` : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--color-text))]">{money(inv.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <div className={`font-semibold ${isEdited ? 'text-amber-600' : 'text-[hsl(var(--color-text))]'}`}>
                          {money(editState[inv.id]?.lateFeeAmount ?? inv.lateFeeAmount)}
                        </div>
                        {isEdited && (
                          <div className="text-xs text-amber-600/70">
                            เดิม: {money(inv.lateFeeAmount)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--color-text))]/40">
                        {inv.rule ? (
                          <div>
                            <div>{inv.rule.penaltyPerDay}/วัน</div>
                            <div>สูงสุด: {money(inv.rule.maxPenalty)}</div>
                            <div>ระยะพัก: {inv.rule.gracePeriodDays} วัน</div>
                          </div>
                        ) : (
                          <span className="text-red-600">ไม่มี rule</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CurrencyInput
                            value={editState[inv.id]?.lateFeeAmount ?? inv.lateFeeAmount}
                            onChange={(n) => handleAmountChange(inv.id, n ?? 0)}
                            ariaLabel="ค่าปรับล่าช้า"
                            className={`w-24 rounded-xl border bg-[hsl(var(--color-surface))] px-2 py-1 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text))]/30 focus:outline-none focus:ring-2 ${
                              isEdited
                                ? 'border-amber-500/30 focus:border-amber-500/50 focus:ring-amber-500/20'
                                : 'border-[hsl(var(--color-border))] focus:border-[hsl(var(--primary))]/50 focus:ring-[hsl(var(--primary))]/20'
                            }`}
                          />
                          {isEdited && (
                            <button
                              onClick={() => {
                                setEditState((prev) => ({
                                  ...prev,
                                  [inv.id]: { lateFeeAmount: inv.lateFeeAmount },
                                }));
                              }}
                              className="text-[hsl(var(--color-text))]/40 hover:text-[hsl(var(--color-text))] active:scale-[0.98] transition-colors"
                              title="รีเซ็ต"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data && data.total > data.pageSize && (
        <div className="text-center text-sm text-[hsl(var(--color-text))]/40">
          แสดง {data.invoices.length} จาก {data.total} รายการ — หากต้องการแบ่งหน้า ให้แจ้งทีมพัฒนา
        </div>
      )}
    </main>
  );
}
