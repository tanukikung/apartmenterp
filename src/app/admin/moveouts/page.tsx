'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/providers/ToastProvider';
import {
  Search,
  Plus,
  X,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  ArrowLeft,
  Eye,
  Calculator,
} from 'lucide-react';

import { MoveOutKpiCard } from '@/components/moveouts/MoveOutKpiCard';
import { MoveOutDetailPanel } from '@/components/moveouts/MoveOutDetailPanel';
import { NewMoveOutForm } from '@/components/moveouts/NewMoveOutForm';
import {
  type MoveOutRecord,
  type MoveOutListResponse,
  type ContractOption,
  type PanelMode,
  EMPTY_NEW_FORM,
  EMPTY_DEDUCTION_FORM,
} from '@/components/moveouts/types';
import { fmtDate, fmtMoney } from '@/components/moveouts/utils';

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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-container">
        <ArrowLeft
          size={28}
          className="text-on-surface-variant"
          strokeWidth={1.5}
        />
      </div>
      <h3 className="text-[15px] font-semibold text-on-surface">
        {hasFilter ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีการบันทึกย้ายออก'}
      </h3>
      <p className="mt-1 max-w-xs text-[13px] text-on-surface-variant">
        {hasFilter
          ? 'ลองล้างการค้นหาหรือเปลี่ยนตัวกรองสถานะ'
          : 'บันทึกการย้ายออกเมื่อผู้เช่าแจ้งย้ายออก'}
      </p>
      {!hasFilter && (
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90 mt-5"
        >
          <Plus size={14} strokeWidth={2.5} />
          บันทึกย้ายออกใหม่
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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

  const moveOuts: MoveOutRecord[] = moveOutsData?.data ?? [];
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

  const filteredMoveOuts = useMemo(() => {
    let list = moveOuts;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.contract?.roomNo.toLowerCase().includes(q) ||
          m.contract?.primaryTenant?.fullName.toLowerCase().includes(q),
      );
    }

    return list;
  }, [moveOuts, search]);

  const kpis = useMemo(() => {
    const all = moveOuts;
    const pending = all.filter((m) => m.status === 'PENDING');
    const confirmed = all.filter((m) => m.status === 'CONFIRMED');
    const refunded = all.filter((m) => m.status === 'REFUNDED');
    const totalRefund = all.reduce((sum, m) => sum + m.finalRefund, 0);
    return {
      total: total,
      pending: pending.length,
      confirmed: confirmed.length,
      refunded: refunded.length,
      totalRefund,
    };
  }, [moveOuts]);

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
    // Reset deduction form
    setDeductionForm({
      cleaningFee:
        m.items.find((i) => i.category === 'cleaning')?.cost.toString() || '0',
      damageRepairCost:
        m.items.find((i) => i.category === 'damage')?.cost.toString() || '0',
      otherDeductions:
        m.items.find((i) => i.category === 'other')?.cost.toString() || '0',
    });
    // Refresh data from server
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
          json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`,
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
          json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`,
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
          json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`,
        );
      }
      // Refresh detail
      const detailRes = await fetch(`/api/moveouts/${selectedMoveOut.id}`);
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        setSelectedMoveOut(detailJson.data);
      }
      // Reset form
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
              json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`,
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
              json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`,
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
              json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`,
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
              json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`,
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
          json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`,
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
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
                <ArrowLeft size={20} className="text-white" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-base font-semibold text-on-primary">
                  การย้ายออก
                </h1>
                <p className="text-xs text-on-primary/80 mt-0.5">
                  จัดการข้อมูลการย้ายออกและคืนเงินมัดจำ
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30"
                onClick={() => void refetchMoveOuts()}
                title="Refresh"
              >
                <RefreshCw size={13} />
                รีเฟรช
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-white/30"
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
          <MoveOutKpiCard
            label="ทั้งหมด"
            value={kpis.total}
            sub="รายการ"
            color="bg-indigo-500"
            icon={Clock}
          />
          <MoveOutKpiCard
            label="รอดำเนินการ"
            value={kpis.pending}
            sub="รอตรวจสอบ"
            color="bg-gray-500"
            icon={Clock}
          />
          <MoveOutKpiCard
            label="ยืนยันแล้ว"
            value={kpis.confirmed}
            sub="รอคืนเงิน"
            color="bg-amber-500"
            icon={CheckCircle2}
          />
          <MoveOutKpiCard
            label="คืนเงินแล้ว"
            value={kpis.refunded}
            sub="เสร็จสิ้น"
            color="bg-emerald-500"
            icon={CheckCircle2}
          />
          <MoveOutKpiCard
            label="รวมคืนเงิน"
            value={fmtMoney(kpis.totalRefund)}
            sub="จำนวนเงิน"
            color="bg-teal-500"
            icon={Calculator}
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 pl-8"
              placeholder="ค้นหาหมายเลขห้องหรือชื่อผู้เช่า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">ทุกสถานะ</option>
            <option value="PENDING">รอดำเนินการ</option>
            <option value="INSPECTION_DONE">ตรวจสอบแล้ว</option>
            <option value="DEPOSIT_CALCULATED">คำนวณแล้ว</option>
            <option value="CONFIRMED">ยืนยันแล้ว</option>
            <option value="REFUNDED">คืนเงินแล้ว</option>
            <option value="CANCELLED">ยกเลิก</option>
          </select>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-error-container bg-error-container/20 px-4 py-3 text-sm font-medium text-on-error-container">
            <AlertCircle size={15} />
            {error.message}
          </div>
        )}

        {/* Table */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-surface-container">
                  <th className="pl-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    ห้อง
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    ผู้เช่า
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    วันที่ย้ายออก
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    มัดจำ
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    หัก
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    คืนเงิน
                  </th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    สถานะ
                  </th>
                  <th className="pr-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant text-right">
                    การดำเนินการ
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}>
                          <div
                            className="h-4 rounded bg-surface-container animate-pulse"
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
                      className={`hover:bg-surface-container-lowest cursor-pointer ${
                        selectedMoveOut?.id === m.id && panelMode === 'detail'
                          ? 'ring-2 ring-inset ring-primary'
                          : ''
                      }`}
                      onClick={() => openDetail(m)}
                    >
                      <td className="pl-4 font-semibold text-on-surface">
                        {m.contract?.roomNo ?? '—'}
                      </td>
                      <td className="text-on-surface">
                        <div className="font-medium">
                          {m.contract?.primaryTenant?.fullName ?? '—'}
                        </div>
                        {m.contract?.primaryTenant?.phone && (
                          <div className="text-[11px] text-on-surface-variant">
                            {m.contract.primaryTenant.phone}
                          </div>
                        )}
                      </td>
                      <td className="text-on-surface">
                        {fmtDate(m.moveOutDate)}
                      </td>
                      <td className="text-on-surface">
                        {fmtMoney(m.depositAmount)}
                      </td>
                      <td className="text-on-surface text-red-600">
                        {m.totalDeduction > 0
                          ? `-${fmtMoney(m.totalDeduction)}`
                          : '—'}
                      </td>
                      <td className="font-medium text-on-surface">
                        {fmtMoney(m.finalRefund)}
                      </td>
                      <td>
                        {/* Inline StatusBadge to avoid circular import issues in thin page */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
                            {
                              PENDING: 'bg-gray-100 text-gray-700 border-gray-200',
                              INSPECTION_DONE: 'bg-blue-100 text-blue-700 border-blue-200',
                              DEPOSIT_CALCULATED: 'bg-amber-100 text-amber-700 border-amber-200',
                              CONFIRMED: 'bg-indigo-100 text-indigo-700 border-indigo-200',
                              REFUNDED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                              CANCELLED: 'bg-red-100 text-red-700 border-red-200',
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
                          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container flex items-center gap-1 text-xs"
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
            <div className="flex items-center justify-between border-t border-outline-variant px-4 py-2.5">
              <span className="text-xs text-on-surface-variant">
                แสดง {filteredMoveOuts.length} จาก {total} รายการ
              </span>
              <div className="flex items-center gap-1">
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ก่อนหน้า
                </button>
                <span className="px-2 text-xs text-on-surface-variant">
                  หน้า {page}
                </span>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page >= Math.ceil(total / 50)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Side Panel ───────────────────────────────────────────── */}
      {panelMode !== 'none' && (
        <aside className="fixed right-0 top-0 z-30 flex h-full w-full flex-col border-l border-outline-variant bg-surface-container-lowest shadow-2xl xl:w-[420px]">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
            <div className="flex items-center gap-2">
              {panelMode === 'new' ? (
                <Plus size={16} className="text-primary" />
              ) : (
                <Eye size={15} className="text-primary" />
              )}
              <span className="text-[15px] font-semibold text-on-surface">
                {panelMode === 'new'
                  ? 'บันทึกย้ายออกใหม่'
                  : `รายละเอียด — ห้อง ${selectedMoveOut?.contract?.roomNo ?? ''}`}
              </span>
            </div>
            <button
              onClick={closePanel}
              className="flex h-7 w-7 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
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
          className="fixed inset-0 z-20 bg-black/20 xl:hidden"
          onClick={closePanel}
        />
      )}
    </div>
  );
}
