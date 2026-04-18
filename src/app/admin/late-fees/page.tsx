'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, ThumbsUp, X } from 'lucide-react';


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
  useCallback(() => {
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

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-on-primary">Late Fee Review</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">
              Review and approve late fee amounts calculated by the nightly job
            </p>
          </div>
          <button
            onClick={() => void refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error.message}
        </div>
      ) : null}

      {saveSuccess ? (
        <div className="auth-alert auth-alert-success flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Late fees saved successfully
        </div>
      ) : null}

      {/* Stats */}
      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Overdue Invoices</div>
            <div className="mt-2 text-2xl font-semibold text-on-surface">{stats.overdue}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Paid Invoices</div>
            <div className="mt-2 text-2xl font-semibold text-on-surface">{stats.paid}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Total Late Fees</div>
            <div className="mt-2 text-2xl font-semibold text-on-surface">{money(stats.totalLateFees)}</div>
          </div>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Rooms Affected</div>
            <div className="mt-2 text-2xl font-semibold text-on-surface">{stats.totalRooms}</div>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest p-1">
          {(['OVERDUE', 'PAID', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {f === 'all' ? 'ทั้งหมด' : f === 'OVERDUE' ? 'ค้างชำระ' : 'ชำระแล้ว'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="text"
            placeholder="ค้นหาห้อง..."
            value={roomSearch}
            onChange={(e) => setRoomSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-outline bg-surface-container-lowest pl-9 pr-4 text-sm text-on-surface focus:border-primary focus:outline-none"
          />
        </div>
        {roomSearch && (
          <button onClick={() => setRoomSearch('')} className="text-sm text-primary hover:underline">
            Clear
          </button>
        )}

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-on-surface-variant">{selectedIds.size} selected</span>
            <button
              onClick={() => void handleBulkApprove()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
              Approve Selected
            </button>
          </div>
        )}

        {hasChanges && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-amber-600">Unsaved changes</span>
            <button
              onClick={() => void handleSaveAll()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save All Changes
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : data && data.invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <p className="text-on-surface-variant">No overdue invoices with late fees</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-surface-container">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={data ? selectedIds.size === data.invoices.length && data.invoices.length > 0 : false}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-outline"
                    />
                  </th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">รอบบิล</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">วันครบกำหนด</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ค่าค้างชำระ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ค่าปรับล่าช้า</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Late Fee Rule</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Ajdust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {data?.invoices.map((inv) => {
                  const isEdited = editState[inv.id]?.lateFeeAmount !== inv.lateFeeAmount;
                  const daysOverdue = Math.floor(
                    (Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)
                  );
                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-surface-container-lowest transition-colors ${
                        isEdited ? 'bg-amber-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          className="h-4 w-4 rounded border-outline"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-on-surface">{inv.roomNo}</div>
                        <div className="text-xs text-on-surface-variant">
                          {inv.tenants.map((t) => `${t.firstName} ${t.lastName}`).join(', ') || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface">
                        {monthLabel(inv.year, inv.month)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          inv.status === 'OVERDUE'
                            ? 'bg-red-100 text-red-700 border border-red-200'
                            : 'bg-green-100 text-green-700 border border-green-200'
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
                        <div className="text-on-surface">{formatDate(inv.dueDate)}</div>
                        <div className={`text-xs ${daysOverdue > 0 ? 'text-red-600 font-medium' : 'text-on-surface-variant'}`}>
                          {daysOverdue > 0 ? `${daysOverdue} วัน` : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-on-surface">{money(inv.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <div className={`font-semibold ${isEdited ? 'text-amber-700' : 'text-on-surface'}`}>
                          {money(editState[inv.id]?.lateFeeAmount ?? inv.lateFeeAmount)}
                        </div>
                        {isEdited && (
                          <div className="text-xs text-amber-600">
                            was: {money(inv.lateFeeAmount)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-on-surface-variant">
                        {inv.rule ? (
                          <div>
                            <div>{inv.rule.penaltyPerDay}/วัน</div>
                            <div>max: {money(inv.rule.maxPenalty)}</div>
                            <div>grace: {inv.rule.gracePeriodDays} วัน</div>
                          </div>
                        ) : (
                          <span className="text-red-500">ไม่มี rule</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={editState[inv.id]?.lateFeeAmount ?? inv.lateFeeAmount}
                            onChange={(e) => handleAmountChange(inv.id, parseFloat(e.target.value) || 0)}
                            className={`w-24 rounded-lg border px-2 py-1 text-sm focus:outline-none focus:ring-1 ${
                              isEdited
                                ? 'border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500/30'
                                : 'border-outline bg-surface-container-lowest focus:border-primary focus:ring-primary/30'
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
                              className="text-on-surface-variant hover:text-on-surface"
                              title="Reset"
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
        <div className="text-center text-sm text-on-surface-variant">
          Showing {data.invoices.length} of {data.total} — paginate if needed
        </div>
      )}
    </main>
  );
}
