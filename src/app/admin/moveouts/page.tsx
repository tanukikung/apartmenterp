'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/providers/ToastProvider';
import { Search, Plus, X, AlertCircle, CheckCircle2, Clock, RefreshCw, ArrowLeft, Eye, Calculator } from 'lucide-react';

import { MoveOutDetailPanel } from '@/components/moveouts/MoveOutDetailPanel';
import { NewMoveOutForm } from '@/components/moveouts/NewMoveOutForm';
import { type MoveOutRecord, type MoveOutListResponse, type ContractOption, type PanelMode, EMPTY_NEW_FORM, EMPTY_DEDUCTION_FORM } from '@/components/moveouts/types';
import { fmtDate, fmtMoney } from '@/components/moveouts/utils';

// ─── Glass Card ─────────────────────────────────────────────────────────────

function GlassCard({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={[
      'rounded-2xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]',
      'shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.04)]',
      hover ? 'hover:bg-[hsl(var(--color-surface))]/80 hover:shadow-[0_12px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(99,102,241,0.15)] hover:scale-[1.01] transition-all duration-200 cursor-pointer' : '',
      className,
    ].join(' ')}>
      {children}
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({
  onNew,
  hasFilter,
}: {
  onNew: () => void;
  hasFilter: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[hsl(var(--color-surface))]">
        <ArrowLeft
          size={28}
          className="text-[hsl(var(--color-text))]/30"
          strokeWidth={1.5}
        />
      </div>
      <h3 className="text-[15px] font-semibold text-[hsl(var(--color-text))]">
        {hasFilter ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีการบันทึกย้ายออก'}
      </h3>
      <p className="mt-1 max-w-xs text-[13px] text-[hsl(var(--color-text))]/40">
        {hasFilter
          ? 'ลองล้างการค้นหาหรือเปลี่ยนตัวกรองสถานะ'
          : 'บันทึกการย้ายออกเมื่อผู้เช่าแจ้งย้ายออก'}
      </p>
      {!hasFilter && (
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-500/20 border border-indigo-500/30 px-5 py-2.5 text-sm font-semibold text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all hover:bg-indigo-500/30 active:scale-95 mt-5"
        >
          <Plus size={14} strokeWidth={2.5} />
          บันทึกย้ายออกใหม่
        </button>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AdminMoveOutsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description?: string;
    dangerous?: boolean;
    onConfirm: () => void;
  }>({ open: false, title: '', onConfirm: () => {} });

  // Filter / search state
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  // Panel state
  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [selectedMoveOut, setSelectedMoveOut] = useState<MoveOutRecord | null>(
    null,
  );

  // Form state — new move-out
  const [newForm, setNewForm] = useState({ ...EMPTY_NEW_FORM });
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  // Form state — deduction calculation
  const [deductionForm, setDeductionForm] = useState({ ...EMPTY_DEDUCTION_FORM });
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  // Form state — inspection item
  const [newItemForm, setNewItemForm] = useState({
    category: 'wall',
    item: '',
    condition: 'GOOD' as 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING',
    cost: '0',
    notes: '',
  });
  const [itemSaving, setItemSaving] = useState(false);

  // ── Move-outs query ────────────────────────────────────────────────────────

  const { data: moveOutsData, isLoading: loading, error: error, refetch: refetchMoveOuts } = useQuery({
    queryKey: ['moveouts', page, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
      });
      if (filterStatus) {
        params.set('status', filterStatus);
      }
      const res = await fetch(`/api/moveouts?${params}`);
      if (!res.ok) throw new Error(`ไม่สำเร็จ: รหัส ${res.status}`);
      const json: { success: boolean; data: MoveOutListResponse } =
        await res.json();
      if (!json.success) throw new Error('API ส่งคืนข้อผิดพลาด');
      return json.data;
    },
  });

  const filteredMoveOuts = useMemo(() => {
    let list: MoveOutRecord[] = moveOutsData?.data ?? [];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.contract?.roomNo.toLowerCase().includes(q) ||
          m.contract?.primaryTenant?.fullName.toLowerCase().includes(q),
      );
    }

    return list;
  }, [moveOutsData, search]);

  const total = moveOutsData?.total ?? 0;

  // ── Contracts query (for new move-out form) ────────────────────────────────

  const { data: contractsData, isLoading: contractsLoading } = useQuery({
    queryKey: ['contracts-active'],
    queryFn: async () => {
      const res = await fetch('/api/contracts?status=ACTIVE&pageSize=300');
      if (!res.ok) return [];
      const json = await res.json();
      if (!json.success) return [];
      const contractsFromApi: {
        id: string;
        roomNo: string;
        depositAmount: number;
        status: string;
        primaryTenant?: { fullName: string };
      }[] = json.data.data;
      return contractsFromApi.map((c) => ({
        id: c.id,
        roomNo: c.roomNo,
        tenantName: c.primaryTenant?.fullName || 'ไม่ระบุ',
        deposit: c.depositAmount,
        status: c.status,
      }));
    },
    enabled: panelMode === 'new',
  });

  const contracts: ContractOption[] = contractsData ?? [];

  // ── Derived / computed ──────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const all: MoveOutRecord[] = moveOutsData?.data ?? [];
    const pending = all.filter((m) => m.status === 'PENDING');
    const confirmed = all.filter((m) => m.status === 'CONFIRMED');
    const refunded = all.filter((m) => m.status === 'REFUNDED');
    const totalRefund = all.reduce((sum, m) => sum + m.finalRefund, 0);
    return {
      total: all.length,
      pending: pending.length,
      confirmed: confirmed.length,
      refunded: refunded.length,
      totalRefund,
    };
  }, [moveOutsData]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openNew() {
    setNewForm({ ...EMPTY_NEW_FORM });
    setNewError(null);
    setPanelMode('new');
    setSelectedMoveOut(null);
  }

  async function openDetail(m: MoveOutRecord) {
    setSelectedMoveOut(m);
    setPanelMode('detail');
    setDeductionForm({
      cleaningFee:
        m.items.find((i) => i.category === 'cleaning')?.cost.toString() || '0',
      damageRepairCost:
        m.items.find((i) => i.category === 'damage')?.cost.toString() || '0',
      otherDeductions:
        m.items.find((i) => i.category === 'other')?.cost.toString() || '0',
    });
    try {
      const res = await fetch(`/api/moveouts/${m.id}`);
      if (res.ok) {
        const json = await res.json();
        setSelectedMoveOut(json.data);
      }
    } catch {
      // Use cached data
    }
  }

  function closePanel() {
    setPanelMode('none');
    setSelectedMoveOut(null);
    setNewError(null);
    setCalcError(null);
  }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNewSaving(true);
    setNewError(null);
    try {
      const body = {
        contractId: newForm.contractId,
        moveOutDate: new Date(newForm.moveOutDate).toISOString(),
        notes: newForm.notes || undefined,
      };
      const res = await fetch('/api/moveouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) ?? `ไม่สำเร็จ: รหัส ${res.status}`,
        );
      }
      closePanel();
      void queryClient.invalidateQueries({ queryKey: ['moveouts'] });
    } catch (err) {
      setNewError(
        err instanceof Error ? err.message : 'ไม่สามารถสร้างการย้ายออก',
      );
    } finally {
      setNewSaving(false);
    }
  }

  async function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMoveOut) return;
    setCalculating(true);
    setCalcError(null);
    try {
      const body = {
        cleaningFee: parseFloat(deductionForm.cleaningFee) || 0,
        damageRepairCost: parseFloat(deductionForm.damageRepairCost) || 0,
        otherDeductions: parseFloat(deductionForm.otherDeductions) || 0,
      };
      const res = await fetch(
        `/api/moveouts/${selectedMoveOut.id}/calculate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) ?? `ไม่สำเร็จ: รหัส ${res.status}`,
        );
      }
      setSelectedMoveOut(json.data);
      void queryClient.invalidateQueries({ queryKey: ['moveouts'] });
    } catch (err) {
      setCalcError(
        err instanceof Error ? err.message : 'ไม่สามารถคำนวณมัดจำ',
      );
    } finally {
      setCalculating(false);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMoveOut) return;
    setItemSaving(true);
    try {
      const body = {
        category: newItemForm.category,
        item: newItemForm.item,
        condition: newItemForm.condition,
        cost: parseFloat(newItemForm.cost) || 0,
        notes: newItemForm.notes || undefined,
      };
      const res = await fetch(`/api/moveouts/${selectedMoveOut.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) ?? `ไม่สำเร็จ: รหัส ${res.status}`,
        );
      }
      const detailRes = await fetch(`/api/moveouts/${selectedMoveOut.id}`);
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        setSelectedMoveOut(detailJson.data);
      }
      setNewItemForm({
        category: 'wall',
        item: '',
        condition: 'GOOD',
        cost: '0',
        notes: '',
      });
      void queryClient.invalidateQueries({ queryKey: ['moveouts'] });
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'ไม่สามารถเพิ่มรายการ',
        'error',
      );
    } finally {
      setItemSaving(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!selectedMoveOut) return;
    setConfirmDialog({
      open: true,
      title: 'ลบรายการ',
      description: 'ต้องการลบรายการนี้?',
      dangerous: true,
      onConfirm: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          const res = await fetch(
            `/api/moveouts/${selectedMoveOut!.id}/items/${itemId}`,
            {
              method: 'DELETE',
            },
          );
          if (!res.ok) {
            const json = await res.json();
            throw new Error(
              json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) ?? `ไม่สำเร็จ: รหัส ${res.status}`,
            );
          }
          const detailRes = await fetch(
            `/api/moveouts/${selectedMoveOut!.id}`,
          );
          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            setSelectedMoveOut(detailJson.data);
          }
          void queryClient.invalidateQueries({ queryKey: ['moveouts'] });
        } catch (err) {
          toast(
            err instanceof Error ? err.message : 'ไม่สามารถลบรายการ',
            'error',
          );
        }
      },
    });
  }

  async function handleConfirm() {
    if (!selectedMoveOut) return;
    setConfirmDialog({
      open: true,
      title: 'ยืนยันการย้ายออก',
      description: 'ยืนยันการย้ายออก?',
      onConfirm: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          const res = await fetch(
            `/api/moveouts/${selectedMoveOut!.id}/confirm`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            },
          );
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(
              json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) ?? `ไม่สำเร็จ: รหัส ${res.status}`,
            );
          }
          setSelectedMoveOut(json.data);
          void queryClient.invalidateQueries({ queryKey: ['moveouts'] });
        } catch (err) {
          toast(
            err instanceof Error ? err.message : 'ไม่สามารถยืนยันการย้ายออก',
            'error',
          );
        }
      },
    });
  }

  async function handleRefund() {
    if (!selectedMoveOut) return;
    setConfirmDialog({
      open: true,
      title: 'ยืนยันการคืนเงินมัดจำ',
      description: 'ยืนยันการคืนเงินมัดจำ?',
      onConfirm: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          const res = await fetch(
            `/api/moveouts/${selectedMoveOut!.id}/refund`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            },
          );
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(
              json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) ?? `ไม่สำเร็จ: รหัส ${res.status}`,
            );
          }
          setSelectedMoveOut(json.data);
          void queryClient.invalidateQueries({ queryKey: ['moveouts'] });
        } catch (err) {
          toast(
            err instanceof Error ? err.message : 'ไม่สามารถบันทึกการคืนเงิน',
            'error',
          );
        }
      },
    });
  }

  async function handleCancel() {
    if (!selectedMoveOut) return;
    setConfirmDialog({
      open: true,
      title: 'ยกเลิกการย้ายออก',
      description: 'ต้องการยกเลิกการย้ายออก?',
      dangerous: true,
      onConfirm: async () => {
        setConfirmDialog((p) => ({ ...p, open: false }));
        try {
          const res = await fetch(
            `/api/moveouts/${selectedMoveOut!.id}/cancel`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            },
          );
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(
              json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) ?? `ไม่สำเร็จ: รหัส ${res.status}`,
            );
          }
          closePanel();
          void queryClient.invalidateQueries({ queryKey: ['moveouts'] });
        } catch (err) {
          toast(
            err instanceof Error ? err.message : 'ไม่สามารถยกเลิกการย้ายออก',
            'error',
          );
        }
      },
    });
  }

  async function handleSendNotice() {
    if (!selectedMoveOut) return;
    try {
      const res = await fetch(
        `/api/moveouts/${selectedMoveOut.id}/send-notice`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : JSON.stringify(json.error)) ?? `ไม่สำเร็จ: รหัส ${res.status}`,
        );
      }
      toast('ส่งการแจ้งเตือนไปยัง LINE เรียบร้อยแล้ว', 'success');
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'ไม่สามารถส่งการแจ้งเตือน',
        'error',
      );
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Main content ─────────────────────────────────────────── */}
      <main
        className={`space-y-6 flex-1 min-w-0 transition-all duration-200 ${
          panelMode !== 'none' ? 'mr-0 xl:mr-[420px]' : ''
        }`}
      >
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))]/50 px-6 py-5 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(99,102,241,0.2)]">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.1),_transparent_60%)]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                <ArrowLeft size={20} className="text-[hsl(var(--color-text))]" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-base font-semibold text-[hsl(var(--color-text))]">
                  การย้ายออก
                </h1>
                <p className="text-xs text-[hsl(var(--color-text))]/60 mt-0.5">
                  จัดการข้อมูลการย้ายออกและคืนเงินมัดจำ
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))] shadow-sm transition-all hover:bg-white/10 active:scale-95"
                onClick={() => void refetchMoveOuts()}
                title="Refresh"
              >
                <RefreshCw size={13} />
                รีเฟรช
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 px-4 py-2 text-sm font-semibold text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all hover:bg-indigo-500/30 active:scale-95"
                onClick={openNew}
              >
                <Plus size={14} strokeWidth={2.5} />
                บันทึกย้ายออกใหม่
              </button>
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-1">
          <GlassCard className="p-4" hover>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50">
                <Clock className="h-5 w-5 text-[hsl(var(--color-text))]/60" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[hsl(var(--color-text))]">{kpis.total}</p>
                <p className="text-xs font-medium text-[hsl(var(--color-text))]/40">รายการ</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4" hover>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 shadow-[0_0_20px_rgba(251,191,36,0.15)]">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-400">{kpis.pending}</p>
                <p className="text-xs font-medium text-[hsl(var(--color-text))]/40">รอดำเนินการ</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4" hover>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/20 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                <CheckCircle2 className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-indigo-400">{kpis.confirmed}</p>
                <p className="text-xs font-medium text-[hsl(var(--color-text))]/40">ยืนยันแล้ว</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4" hover>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_0_20px_rgba(34,197,94,0.15)]">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">{kpis.refunded}</p>
                <p className="text-xs font-medium text-[hsl(var(--color-text))]/40">คืนเงินแล้ว</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-4" hover>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10 shadow-[0_0_20px_rgba(20,184,166,0.15)]">
                <Calculator className="h-5 w-5 text-teal-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-teal-400">{fmtMoney(kpis.totalRefund)}</p>
                <p className="text-xs font-medium text-[hsl(var(--color-text))]/40">รวมคืนเงิน</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--color-text))]/30"
            />
            <input
              className="w-full rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 py-2.5 pl-8 pr-3 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text))]/30 focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              placeholder="ค้นหาหมายเลขห้องหรือชื่อผู้เช่า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="w-full rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-3 py-2.5 text-sm text-[hsl(var(--color-text))] focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="" className="bg-slate-900">ทุกสถานะ</option>
            <option value="PENDING" className="bg-slate-900">รอดำเนินการ</option>
            <option value="INSPECTION_DONE" className="bg-slate-900">ตรวจสอบแล้ว</option>
            <option value="DEPOSIT_CALCULATED" className="bg-slate-900">คำนวณแล้ว</option>
            <option value="CONFIRMED" className="bg-slate-900">ยืนยันแล้ว</option>
            <option value="REFUNDED" className="bg-slate-900">คืนเงินแล้ว</option>
            <option value="CANCELLED" className="bg-slate-900">ยกเลิก</option>
          </select>
        </div>

        {/* Error banner */}
        {error && (
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle size={15} />
              {error.message}
            </div>
          </GlassCard>
        )}

        {/* Table */}
        <GlassCard>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="pl-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/30">
                    ห้อง
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/30">
                    ผู้เช่า
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/30">
                    วันที่ย้ายออก
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/30">
                    มัดจำ
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/30">
                    หัก
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/30">
                    คืนเงิน
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/30">
                    สถานะ
                  </th>
                  <th className="pr-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))]/30 text-right">
                    การดำเนินการ
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="pl-4 py-3">
                          <div
                            className="h-4 rounded bg-white/5 animate-pulse"
                            style={{
                              width: `${70 + ((i * 13 + j * 17) % 25)}%`,
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredMoveOuts.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        onNew={openNew}
                        hasFilter={!!search || !!filterStatus}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredMoveOuts.map((m) => (
                    <tr
                      key={m.id}
                      className={`border-b border-white/5 hover:bg-[hsl(var(--color-surface))] cursor-pointer transition-colors ${
                        selectedMoveOut?.id === m.id && panelMode === 'detail'
                          ? 'ring-2 ring-inset ring-indigo-500/30'
                          : ''
                      }`}
                      onClick={() => openDetail(m)}
                    >
                      <td className="pl-4 font-semibold text-[hsl(var(--color-text))]">
                        {m.contract?.roomNo ?? '—'}
                      </td>
                      <td className="text-[hsl(var(--color-text))]/80">
                        <div className="font-medium text-[hsl(var(--color-text))]">
                          {m.contract?.primaryTenant?.fullName ?? '—'}
                        </div>
                        {m.contract?.primaryTenant?.phone && (
                          <div className="text-[11px] text-[hsl(var(--color-text))]/30">
                            {m.contract.primaryTenant.phone}
                          </div>
                        )}
                      </td>
                      <td className="text-[hsl(var(--color-text))]/70">
                        {fmtDate(m.moveOutDate)}
                      </td>
                      <td className="text-[hsl(var(--color-text))]/70">
                        {fmtMoney(m.depositAmount)}
                      </td>
                      <td className="text-red-400">
                        {m.totalDeduction > 0
                          ? `-${fmtMoney(m.totalDeduction)}`
                          : '—'}
                      </td>
                      <td className="font-medium text-emerald-400">
                        {fmtMoney(m.finalRefund)}
                      </td>
                      <td>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                            {
                              PENDING: 'bg-white/5 text-[hsl(var(--on-surface-variant))] border-white/10',
                              INSPECTION_DONE: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                              DEPOSIT_CALCULATED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                              CONFIRMED: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
                              REFUNDED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                              CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
                            }[m.status]
                          }`}
                        >
                          {{
                            PENDING: 'รอดำเนินการ',
                            INSPECTION_DONE: 'ตรวจสอบแล้ว',
                            DEPOSIT_CALCULATED: 'คำนวณแล้ว',
                            CONFIRMED: 'ยืนยันแล้ว',
                            REFUNDED: 'คืนเงินแล้ว',
                            CANCELLED: 'ยกเลิก',
                          }[m.status]}
                        </span>
                      </td>
                      <td className="pr-4 text-right">
                        <button
                          className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))] shadow-sm transition-all hover:bg-white/10 active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(m);
                          }}
                        >
                          <Eye size={11} />
                          รายละเอียด
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {!loading && filteredMoveOuts.length > 0 && (
            <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
              <span className="text-xs text-[hsl(var(--color-text))]/30">
                แสดง {filteredMoveOuts.length} จาก {total} รายการ
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))] shadow-sm transition-all hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ก่อนหน้า
                </button>
                <span className="px-2 text-xs text-[hsl(var(--color-text))]/40">
                  หน้า {page}
                </span>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/50 px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))] shadow-sm transition-all hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                  disabled={page >= Math.ceil(total / 50)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </GlassCard>
      </main>

      {/* ── Side Panel ───────────────────────────────────────────── */}
      {panelMode !== 'none' && (
        <aside className="fixed right-0 top-0 z-30 flex h-full w-full flex-col border-l border-[hsl(var(--color-border))]/50 bg-[hsl(var(--color-surface))]/90 shadow-[0_8px_32px_rgba(0,0,0,0.5)] xl:w-[420px]">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              {panelMode === 'new' ? (
                <Plus size={16} className="text-indigo-400" />
              ) : (
                <Eye size={15} className="text-indigo-400" />
              )}
              <span className="text-[15px] font-semibold text-[hsl(var(--color-text))]">
                {panelMode === 'new'
                  ? 'บันทึกย้ายออกใหม่'
                  : `รายละเอียด — ห้อง ${selectedMoveOut?.contract?.roomNo ?? ''}`}
              </span>
            </div>
            <button
              onClick={closePanel}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--color-text))]/40 hover:bg-white/5 hover:text-[hsl(var(--color-text))] transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-5">
            {panelMode === 'new' ? (
              <NewMoveOutForm
                form={newForm}
                setForm={setNewForm}
                contracts={contracts}
                contractsLoading={contractsLoading}
                onSubmit={handleNewSubmit}
                saving={newSaving}
                error={newError}
                onCancel={closePanel}
              />
            ) : (
              selectedMoveOut && (
                <MoveOutDetailPanel
                  moveOut={selectedMoveOut}
                  deductionForm={deductionForm}
                  setDeductionForm={setDeductionForm}
                  newItemForm={newItemForm}
                  setNewItemForm={setNewItemForm}
                  onCalculate={handleCalculate}
                  onAddItem={handleAddItem}
                  onDeleteItem={handleDeleteItem}
                  onConfirm={handleConfirm}
                  onRefund={handleRefund}
                  onCancel={handleCancel}
                  onSendNotice={handleSendNotice}
                  calculating={calculating}
                  calcError={calcError}
                  itemSaving={itemSaving}
                  confirmDialog={confirmDialog}
                  setConfirmDialog={setConfirmDialog}
                />
              )
            )}
          </div>
        </aside>
      )}

      {/* Backdrop for panel on mobile */}
      {panelMode !== 'none' && (
        <div
          className="fixed inset-0 z-20 bg-black/40 xl:hidden"
          onClick={closePanel}
        />
      )}
    </div>
  );
}
