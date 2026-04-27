'use client';

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Search, Plus, X, ChevronRight, FileSignature, AlertCircle, CheckCircle2, Clock, XCircle, Pencil, RefreshCw } from 'lucide-react';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { statusBadgeClassWithBorder } from '@/lib/status-colors';

// ─── Types ───────────────────────────────────────────────────────────────────

type ContractStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATED';

interface ContractRecord {
  id: string;
  roomNo: string;
  primaryTenantId: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  depositAmount: number;
  status: ContractStatus;
  terminationDate: string | null;
  terminationReason: string | null;
  createdAt: string;
  updatedAt: string;
  room?: { roomNo: string };
  primaryTenant?: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    phone: string;
  };
}

interface ContractListResponse {
  data: ContractRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface RoomOption {
  roomNo: string;
  floorNo: number;
  roomStatus: string;
  defaultRentAmount: number;
}

interface TenantOption {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
}

type PanelMode = 'none' | 'new' | 'edit';

const EMPTY_NEW_FORM = {
  roomId: '',
  primaryTenantId: '',
  startDate: '',
  endDate: '',
  rentAmount: '',
  depositAmount: '',
  notes: '',
};

const EMPTY_EDIT_FORM = {
  startDate: '',
  endDate: '',
  rentAmount: '',
  depositAmount: '',
  status: 'ACTIVE' as ContractStatus,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtMoney(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0 }) + ' ฿';
}

function daysUntil(dateStr: string): number {
  const end = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function resolveDisplayStatus(contract: ContractRecord): 'ACTIVE' | 'EXPIRED' | 'TERMINATED' | 'EXPIRING_SOON' {
  if (contract.status === 'TERMINATED') return 'TERMINATED';
  if (contract.status === 'EXPIRED') return 'EXPIRED';
  const days = daysUntil(contract.endDate);
  if (days <= 30 && days >= 0) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReturnType<typeof resolveDisplayStatus> }) {
  const cfg: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'neutral'; Icon: typeof CheckCircle2 }> = {
    ACTIVE:        { label: 'ใช้งาน',         color: 'success', Icon: CheckCircle2 },
    EXPIRING_SOON: { label: 'ใกล้หมดอายุ',  color: 'warning', Icon: Clock },
    EXPIRED:       { label: 'หมดอายุ',        color: 'danger',  Icon: XCircle },
    TERMINATED:    { label: 'ยกเลิก',          color: 'neutral', Icon: XCircle },
  };
  const entry = cfg[status] ?? cfg.ACTIVE;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${statusBadgeClassWithBorder(entry.color)}`}>
      <entry.Icon size={10} />
      {entry.label}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
  iconColor = 'text-[hsl(var(--on-surface))]',
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  icon: React.ElementType;
  iconColor?: string;
}) {
  return (
    <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur shadow-[0_4px_16px_hsl(var(--color-primary)/_0.06)] flex items-center gap-4 py-4 px-5 hover:border-[hsl(var(--color-border))] transition-all duration-300">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon size={20} className={iconColor} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">{label}</div>
        <div className="text-2xl font-bold text-[hsl(var(--on-surface))] leading-tight">{value}</div>
        {sub && <div className="text-[11px] text-[hsl(var(--on-surface-variant))] mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminContractsPage() {
  const queryClient = useQueryClient();

  // Filter / search state
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [page, setPage] = useState(1);

  // Panel state
  const [panelMode, setPanelMode] = useState<PanelMode>('none');
  const [selectedContract, setSelectedContract] = useState<ContractRecord | null>(null);

  // Form state — new contract
  const [newForm, setNewForm] = useState({ ...EMPTY_NEW_FORM });
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  // Form state — edit contract
  const [editForm, setEditForm] = useState({ ...EMPTY_EDIT_FORM });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Form state — renew contract
  const [showRenewForm, setShowRenewForm] = useState(false);
  const [renewEndDate, setRenewEndDate] = useState('');
  const [renewRentAmount, setRenewRentAmount] = useState('');
  const [renewDepositAmount, setRenewDepositAmount] = useState('');
  const [renewSaving, setRenewSaving] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [renewSuccess, setRenewSuccess] = useState<string | null>(null);

  // Form state — terminate contract
  const [showTerminateDialog, setShowTerminateDialog] = useState(false);
  const [terminateDate, setTerminateDate] = useState('');
  const [terminateReason, setTerminateReason] = useState('');
  const [terminateSaving, setTerminateSaving] = useState(false);
  const [terminateError, setTerminateError] = useState<string | null>(null);

  // ── Contracts query ────────────────────────────────────────────────────────

  const { data: contractsData, isLoading: contractsLoading, error: contractsError, refetch: refetchContracts } = useQuery({
    queryKey: ['contracts', page, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
      });
      if (filterStatus && filterStatus !== 'EXPIRING_SOON') {
        params.set('status', filterStatus);
      }
      const res = await fetch(`/api/contracts?${params}`);
      if (!res.ok) throw new Error(`ไม่สำเร็จ: รหัส ${res.status}`);
      const json: { success: boolean; data: ContractListResponse } = await res.json();
      if (!json.success) throw new Error('API ส่งคืนข้อผิดพลาด');
      return json.data;
    },
  });

  const contracts = useMemo(() => contractsData?.data ?? [], [contractsData?.data]);
  const total = contractsData?.total ?? 0;
  const loading = contractsLoading;
  const error = contractsError?.message ?? null;

  // ── Rooms query (for new contract form) ────────────────────────────────────

  const { data: roomsData } = useQuery({
    queryKey: ['rooms-vacant'],
    queryFn: async () => {
      const res = await fetch('/api/rooms?pageSize=300&roomStatus=VACANT');
      if (!res.ok) return [];
      const json = await res.json();
      return json.success ? (json.data.data ?? []) : [];
    },
    enabled: panelMode === 'new',
  });

  const rooms: RoomOption[] = roomsData ?? [];

  // ── Tenants query (per room) ────────────────────────────────────────────────

  const { data: tenantsData, isLoading: tenantsLoading } = useQuery({
    queryKey: ['room-tenants', newForm.roomId],
    queryFn: async () => {
      if (!newForm.roomId) return [];
      const res = await fetch(`/api/rooms/${encodeURIComponent(newForm.roomId)}/tenants`);
      if (!res.ok) return [];
      const json = await res.json();
      if (!json.success) return [];
      const tenants: TenantOption[] = (json.data as TenantOption[]).map((t) => ({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        fullName: t.fullName ?? `${t.firstName} ${t.lastName}`,
        phone: t.phone,
      }));
      return tenants;
    },
    enabled: !!newForm.roomId,
  });

  const roomTenantsMap: Record<string, TenantOption[]> = {};
  if (newForm.roomId && tenantsData) {
    roomTenantsMap[newForm.roomId] = tenantsData;
  }

  // ── Derived / computed ──────────────────────────────────────────────────────

  const filteredContracts = useMemo(() => {
    let list = contracts;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.roomNo.toLowerCase().includes(q) ||
          (c.primaryTenant?.fullName ?? '').toLowerCase().includes(q)
      );
    }

    if (filterStatus === 'EXPIRING_SOON') {
      list = list.filter((c) => {
        const days = daysUntil(c.endDate);
        return c.status === 'ACTIVE' && days >= 0 && days <= 30;
      });
    }

    return list;
  }, [contracts, search, filterStatus]);

  const kpis = useMemo(() => {
    const all = contracts;
    const active = all.filter((c) => c.status === 'ACTIVE');
    const expiringSoon = active.filter((c) => {
      const d = daysUntil(c.endDate);
      return d >= 0 && d <= 30;
    });
    const expired = all.filter((c) => c.status === 'EXPIRED');
    return {
      total: total,
      active: active.length,
      expiringSoon: expiringSoon.length,
      expired: expired.length,
    };
  }, [contracts, total]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openNew() {
    setNewForm({ ...EMPTY_NEW_FORM });
    setNewError(null);
    setPanelMode('new');
    setSelectedContract(null);
  }

  function openEdit(c: ContractRecord) {
    setSelectedContract(c);
    setEditForm({
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate.slice(0, 10),
      rentAmount: String(c.rentAmount),
      depositAmount: String(c.depositAmount),
      status: c.status,
    });
    setEditError(null);
    setEditSuccess(null);
    setPanelMode('edit');
  }

  function closePanel() {
    setPanelMode('none');
    setSelectedContract(null);
    setNewError(null);
    setEditError(null);
    setEditSuccess(null);
    setShowTerminateDialog(false);
    setTerminateDate('');
    setTerminateReason('');
    setTerminateError(null);
  }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNewSaving(true);
    setNewError(null);
    try {
      const body = {
        roomId: newForm.roomId,
        primaryTenantId: newForm.primaryTenantId,
        startDate: newForm.startDate,
        endDate: newForm.endDate,
        rentAmount: parseFloat(newForm.rentAmount),
        depositAmount: newForm.depositAmount ? parseFloat(newForm.depositAmount) : 0,
      };
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`);
      }
      closePanel();
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'ไม่สามารถสร้างสัญญา');
    } finally {
      setNewSaving(false);
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContract) return;
    setEditSaving(true);
    setEditError(null);
    setEditSuccess(null);
    try {
      const body = {
        startDate: editForm.startDate || undefined,
        endDate: editForm.endDate || undefined,
        rentAmount: editForm.rentAmount ? parseFloat(editForm.rentAmount) : undefined,
        depositAmount: editForm.depositAmount !== '' ? parseFloat(editForm.depositAmount) : undefined,
      };
      const res = await fetch(`/api/contracts/${selectedContract.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`);
      }
      setEditSuccess('อัปเดตสัญญาเรียบร้อยแล้ว');
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'ไม่สามารถอัปเดตสัญญา');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRenewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContract) return;
    setRenewSaving(true);
    setRenewError(null);
    setRenewSuccess(null);
    try {
      const body: Record<string, unknown> = {
        newEndDate: renewEndDate,
      };
      if (renewRentAmount !== '') {
        body.newRentAmount = parseFloat(renewRentAmount);
      }
      if (renewDepositAmount !== '') {
        body.newDepositAmount = parseFloat(renewDepositAmount);
      }
      const res = await fetch(`/api/contracts/${selectedContract.id}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`);
      }
      setRenewSuccess('ต่อสัญญาเรียบร้อยแล้ว');
      setShowRenewForm(false);
      setRenewEndDate('');
      setRenewRentAmount('');
      setRenewDepositAmount('');
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    } catch (err) {
      setRenewError(err instanceof Error ? err.message : 'ไม่สามารถต่อสัญญา');
    } finally {
      setRenewSaving(false);
    }
  }

  async function handleTerminateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContract) return;
    setTerminateSaving(true);
    setTerminateError(null);
    try {
      const res = await fetch(`/api/contracts/${selectedContract.id}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminationDate: terminateDate,
          terminationReason: terminateReason || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message ?? json.error ?? `ไม่สำเร็จ: รหัส ${res.status}`);
      }
      setShowTerminateDialog(false);
      setTerminateDate('');
      setTerminateReason('');
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    } catch (err) {
      setTerminateError(err instanceof Error ? err.message : 'ไม่สามารถยกเลิกสัญญา');
    } finally {
      setTerminateSaving(false);
    }
  }

  function openTerminateForm() {
    setTerminateDate('');
    setTerminateReason('');
    setTerminateError(null);
    setShowTerminateDialog(true);
  }

  function openRenewForm() {
    setRenewEndDate('');
    setRenewRentAmount('');
    setRenewDepositAmount('');
    setRenewError(null);
    setRenewSuccess(null);
    setShowRenewForm(true);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const selectedTenants = newForm.roomId ? (roomTenantsMap[newForm.roomId] ?? []) : [];

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Main content ─────────────────────────────────────────── */}
      <main
        className={`space-y-6 flex-1 min-w-0 transition-all duration-200 ${
          panelMode !== 'none' ? 'mr-0 xl:mr-[420px]' : ''
        }`}
      >
        {/* Hero Header */}
        <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur shadow-[0_4px_20px_rgba(0,0,0,0.1)] px-6 py-5">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-violet-500/10 pointer-events-none" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/20 border border-blue-500/30 shadow-glow-primary">
                <FileSignature size={20} className="text-blue-400" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-base font-semibold text-[hsl(var(--on-surface))]">สัญญาเช่า</h1>
                <p className="text-xs text-[hsl(var(--on-surface))]/50 mt-0.5">จัดการสัญญาเช่าสำหรับทุกห้องที่มีผู้เช่า</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--color-surface))]/[0.1] hover:text-[hsl(var(--on-surface))] active:scale-[0.98]"
                onClick={() => void refetchContracts()}
                title="Refresh"
              >
                <RefreshCw size={13} />
                รีเฟรช
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500/20 border border-blue-500/30 px-4 py-2 text-sm font-semibold text-blue-400 shadow-sm transition-all duration-200 hover:bg-blue-500/30 hover:border-blue-500/50 active:scale-[0.98]"
                onClick={openNew}
              >
                <Plus size={14} strokeWidth={2.5} />
                สร้างสัญญาใหม่
              </button>
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-1">
          <KpiCard
            label="สัญญาทั้งหมด"
            value={kpis.total}
            sub="ทั้งหมด"
            color="bg-blue-500/20 border border-blue-500/30"
            icon={FileText}
          />
          <KpiCard
            label="ใช้งาน"
            value={kpis.active}
            sub="กำลังใช้งาน"
            color="bg-emerald-500/20 border border-emerald-500/30"
            icon={CheckCircle2}
          />
          <KpiCard
            label="ใกล้หมดอายุ"
            value={kpis.expiringSoon}
            sub="ภายใน 30 วัน"
            color="bg-amber-500/20 border border-amber-500/30"
            icon={Clock}
          />
          <KpiCard
            label="หมดอายุ"
            value={kpis.expired}
            sub="เกินวันสิ้นสุด"
            color="bg-red-500/20 border border-red-500/30"
            iconColor="text-red-400"
            icon={XCircle}
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--on-surface))]/30" />
            <input
              className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 pl-8 w-full backdrop-blur-sm transition-all duration-200"
              placeholder="ค้นหาหมายเลขห้องหรือชื่อผู้เช่า..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">ทุกสถานะ</option>
            <option value="ACTIVE">ใช้งาน</option>
            <option value="EXPIRING_SOON">ใกล้หมดอายุ</option>
            <option value="EXPIRED">หมดอายุ</option>
            <option value="TERMINATED">ยกเลิก</option>
          </select>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-400 backdrop-blur-sm">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* Table Card */}
        <div className="rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur shadow-[0_4px_20px_rgba(0,0,0,0.1)] overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-[hsl(var(--color-surface))]/[0.02]">
                  <th className="pl-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">หมายเลขห้อง</th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ชื่อผู้เช่า</th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">วันที่เริ่ม</th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">วันที่สิ้นสุด</th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ค่าเช่ารายเดือน</th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เงินมัดจำ</th>
                  <th className="py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                  <th className="pr-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] text-right">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}>
                          <div className="h-4 rounded bg-[hsl(var(--color-surface))] animate-pulse" style={{ width: `${70 + (i * 13 + j * 17) % 25}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState onNew={openNew} hasFilter={!!search || !!filterStatus} />
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map((c) => {
                    const displayStatus = resolveDisplayStatus(c);
                    const rowCls =
                      displayStatus === 'EXPIRING_SOON'
                        ? 'bg-amber-500/5'
                        : displayStatus === 'EXPIRED'
                        ? 'bg-red-500/5'
                        : displayStatus === 'TERMINATED'
                        ? 'bg-[hsl(var(--color-surface))]/[0.02]'
                        : '';
                    const isSelected = selectedContract?.id === c.id && panelMode === 'edit';
                    return (
                      <tr
                        key={c.id}
                        className={`${rowCls} ${isSelected ? 'ring-2 ring-inset ring-blue-500/50' : ''} cursor-pointer hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150 group`}
                        onClick={() => openEdit(c)}
                      >
                        <td className="pl-4 font-semibold text-[hsl(var(--on-surface))] group-hover:text-blue-400 transition-colors">
                          {c.roomNo}
                        </td>
                        <td>
                          <div className="font-medium text-[hsl(var(--on-surface))]">
                            {c.primaryTenant?.fullName ?? '—'}
                          </div>
                          {c.primaryTenant?.phone && (
                            <div className="text-[11px] text-[hsl(var(--on-surface-variant))]">{c.primaryTenant.phone}</div>
                          )}
                        </td>
                        <td className="text-[hsl(var(--on-surface))]/70">{fmtDate(c.startDate)}</td>
                        <td className="text-[hsl(var(--on-surface))]/70">
                          <span>{fmtDate(c.endDate)}</span>
                          {displayStatus === 'EXPIRING_SOON' && (
                            <span className="ml-1.5 text-[11px] font-semibold text-amber-400">
                              ({daysUntil(c.endDate)}d)
                            </span>
                          )}
                        </td>
                        <td className="font-medium text-[hsl(var(--on-surface))]">{fmtMoney(c.rentAmount)}</td>
                        <td className="text-[hsl(var(--on-surface))]/70">{fmtMoney(c.depositAmount)}</td>
                        <td>
                          <StatusBadge status={displayStatus} />
                        </td>
                        <td className="pr-4 text-right">
                          <button
                            className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--color-surface))]/[0.1] hover:border-[hsl(var(--color-border))] hover:text-[hsl(var(--on-surface))] active:scale-[0.98] flex items-center gap-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(c);
                            }}
                          >
                            <Pencil size={11} />
                            แก้ไข
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          {!loading && filteredContracts.length > 0 && (
            <div className="flex items-center justify-between border-t border-[hsl(var(--color-border))] px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.02]">
              <span className="text-xs text-[hsl(var(--on-surface-variant))]">
                แสดง {filteredContracts.length} จาก {total} สัญญา
              </span>
              <div className="flex items-center gap-1">
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--color-surface))]/[0.1] hover:border-[hsl(var(--color-border))] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ก่อนหน้า
                </button>
                <span className="px-2 text-xs text-[hsl(var(--on-surface-variant))]">หน้า {page}</span>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--color-surface))]/[0.1] hover:border-[hsl(var(--color-border))] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
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
        <aside className="fixed right-0 top-0 z-30 flex h-full w-full flex-col border-l border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/95 backdrop-blur shadow-[-4px_0_20px_rgba(0,0,0,0.1)] xl:w-[420px]">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-5 py-4 bg-[hsl(var(--color-surface))]/[0.02]">
            <div className="flex items-center gap-2">
              {panelMode === 'new' ? (
                <Plus size={16} className="text-blue-400" />
              ) : (
                <Pencil size={15} className="text-blue-400" />
              )}
              <span className="text-[15px] font-semibold text-[hsl(var(--on-surface))]">
                {panelMode === 'new' ? 'สัญญาใหม่' : `แก้ไข — ห้อง ${selectedContract?.roomNo}`}
              </span>
            </div>
            <button
              onClick={closePanel}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--on-surface-variant))] hover:bg-[hsl(var(--color-surface))] hover:text-[hsl(var(--on-surface))] transition-all"
            >
              <X size={15} />
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-5">
            {panelMode === 'new' ? (
              <NewContractForm
                form={newForm}
                setForm={setNewForm}
                rooms={rooms}
                tenants={selectedTenants}
                tenantsLoading={tenantsLoading}
                onRoomChange={(roomNo) => {
                  setNewForm((f) => ({ ...f, roomId: roomNo, primaryTenantId: '' }));
                }}
                onSubmit={handleNewSubmit}
                saving={newSaving}
                error={newError}
                onCancel={closePanel}
              />
            ) : (
              <EditContractForm
                contract={selectedContract!}
                form={editForm}
                setForm={setEditForm}
                onSubmit={handleEditSubmit}
                saving={editSaving}
                error={editError}
                success={editSuccess}
                onCancel={closePanel}
                showRenewForm={showRenewForm}
                renewEndDate={renewEndDate}
                setRenewEndDate={setRenewEndDate}
                renewRentAmount={renewRentAmount}
                setRenewRentAmount={setRenewRentAmount}
                renewDepositAmount={renewDepositAmount}
                setRenewDepositAmount={setRenewDepositAmount}
                onRenewSubmit={handleRenewSubmit}
                renewSaving={renewSaving}
                renewError={renewError}
                renewSuccess={renewSuccess}
                onOpenRenewForm={openRenewForm}
                onCloseRenewForm={() => setShowRenewForm(false)}
                showTerminateDialog={showTerminateDialog}
                terminateDate={terminateDate}
                setTerminateDate={setTerminateDate}
                terminateReason={terminateReason}
                setTerminateReason={setTerminateReason}
                onOpenTerminateForm={openTerminateForm}
                onCloseTerminateForm={() => setShowTerminateDialog(false)}
                onTerminateSubmit={handleTerminateSubmit}
                terminateSaving={terminateSaving}
                terminateError={terminateError}
              />
            )}
          </div>
        </aside>
      )}

      {/* Backdrop for panel on mobile */}
      {panelMode !== 'none' && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm xl:hidden"
          onClick={closePanel}
        />
      )}
    </div>
  );
}

// ─── New Contract Form ────────────────────────────────────────────────────────

function NewContractForm({
  form,
  setForm,
  rooms,
  tenants,
  tenantsLoading,
  onRoomChange,
  onSubmit,
  saving,
  error,
  onCancel,
}: {
  form: typeof EMPTY_NEW_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_NEW_FORM>>;
  rooms: RoomOption[];
  tenants: TenantOption[];
  tenantsLoading: boolean;
  onRoomChange: (roomNo: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  const patch = (k: keyof typeof EMPTY_NEW_FORM, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-[12px] text-[hsl(var(--on-surface-variant))] leading-relaxed">
        สร้างสัญญาเช่าใหม่ ผู้เช่าที่เลือกต้องเป็น<strong className="text-[hsl(var(--on-surface))]/70">ผู้เช่าหลัก</strong>ของห้องที่เลือก
        และต้องไม่มีสัญญาใช้งานอยู่สำหรับห้องนั้น
      </p>

      {/* Room select */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">
          หมายเลขห้อง <span className="text-red-400">*</span>
        </label>
        <select
          className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
          required
          value={form.roomId}
          onChange={(e) => onRoomChange(e.target.value)}
        >
          <option value="">— เลือกห้อง —</option>
          {rooms.map((r) => (
            <option key={r.roomNo} value={r.roomNo}>
              {r.roomNo} (Floor {r.floorNo})
            </option>
          ))}
        </select>
      </div>

      {/* Tenant select */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">
          ผู้เช่าหลัก <span className="text-red-400">*</span>
        </label>
        {tenantsLoading ? (
          <div className="flex h-9 items-center rounded-md border border-[hsl(var(--color-border))] px-3 text-xs text-[hsl(var(--on-surface-variant))] animate-pulse">
            กำลังโหลดผู้เช่า…
          </div>
        ) : (
          <select
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            required
            disabled={!form.roomId}
            value={form.primaryTenantId}
            onChange={(e) => patch('primaryTenantId', e.target.value)}
          >
            <option value="">— เลือกผู้เช่า —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} · {t.phone}
              </option>
            ))}
          </select>
        )}
        {form.roomId && !tenantsLoading && tenants.length === 0 && (
          <p className="mt-1 text-[11px] text-amber-400">
            ไม่พบผู้เช่าสำหรับห้องนี้ กรุณากำหนดผู้เช่าหลักก่อน
          </p>
        )}
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">
            วันที่เริ่ม <span className="text-red-400">*</span>
          </label>
          <ThaiDateInput
            ariaLabel="วันที่เริ่ม"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            required
            value={form.startDate}
            onChange={(iso) => patch('startDate', iso)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">
            วันที่สิ้นสุด <span className="text-red-400">*</span>
          </label>
          <ThaiDateInput
            ariaLabel="วันที่สิ้นสุด"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            required
            value={form.endDate}
            onChange={(iso) => patch('endDate', iso)}
          />
        </div>
      </div>

      {/* Rent & Deposit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">
            ค่าเช่ารายเดือน (฿) <span className="text-red-400">*</span>
          </label>
          <CurrencyInput
            ariaLabel="ค่าเช่ารายเดือน"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            required
            placeholder="e.g. 8000"
            value={form.rentAmount === '' ? null : Number(form.rentAmount)}
            onChange={(n) => patch('rentAmount', n === null ? '' : String(n))}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">
            เงินมัดจำ (฿)
          </label>
          <CurrencyInput
            ariaLabel="เงินมัดจำ"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            placeholder="e.g. 16000"
            value={form.depositAmount === '' ? null : Number(form.depositAmount)}
            onChange={(n) => patch('depositAmount', n === null ? '' : String(n))}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">หมายเหตุ</label>
        <textarea
          className="w-full resize-none rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
          rows={3}
          placeholder="หมายเหตุเพิ่มเติมเกี่ยวกับสัญญานี้…"
          value={form.notes}
          onChange={(e) => patch('notes', e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs font-medium text-red-400 backdrop-blur-sm">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--color-surface))]/[0.1] hover:border-[hsl(var(--color-border))] active:scale-[0.98]" onClick={onCancel}>
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-500/20 border border-blue-500/30 px-5 py-2 text-sm font-semibold text-blue-400 shadow-sm transition-all duration-200 hover:bg-blue-500/30 hover:border-blue-500/50 active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              กำลังบันทึก…
            </>
          ) : (
            <>
              <ChevronRight size={13} />
              บันทึกสัญญา
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Edit Contract Form ───────────────────────────────────────────────────────

function EditContractForm({
  contract,
  form,
  setForm,
  onSubmit,
  saving,
  error,
  success,
  onCancel,
  showRenewForm,
  renewEndDate,
  setRenewEndDate,
  renewRentAmount,
  setRenewRentAmount,
  renewDepositAmount,
  setRenewDepositAmount,
  onRenewSubmit,
  renewSaving,
  renewError,
  renewSuccess,
  onOpenRenewForm,
  onCloseRenewForm,
  showTerminateDialog,
  terminateDate,
  setTerminateDate,
  terminateReason,
  setTerminateReason,
  onOpenTerminateForm,
  onCloseTerminateForm,
  onTerminateSubmit,
  terminateSaving,
  terminateError,
}: {
  contract: ContractRecord;
  form: typeof EMPTY_EDIT_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_EDIT_FORM>>;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  success: string | null;
  onCancel: () => void;
  showRenewForm: boolean;
  renewEndDate: string;
  setRenewEndDate: (v: string) => void;
  renewRentAmount: string;
  setRenewRentAmount: (v: string) => void;
  renewDepositAmount: string;
  setRenewDepositAmount: (v: string) => void;
  onRenewSubmit: (e: React.FormEvent) => void;
  renewSaving: boolean;
  renewError: string | null;
  renewSuccess: string | null;
  onOpenRenewForm: () => void;
  onCloseRenewForm: () => void;
  showTerminateDialog: boolean;
  terminateDate: string;
  setTerminateDate: (v: string) => void;
  terminateReason: string;
  setTerminateReason: (v: string) => void;
  onOpenTerminateForm: () => void;
  onCloseTerminateForm: () => void;
  onTerminateSubmit: (e: React.FormEvent) => void;
  terminateSaving: boolean;
  terminateError: string | null;
}) {
  const patch = (k: keyof typeof EMPTY_EDIT_FORM, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const displayStatus = resolveDisplayStatus(contract);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Contract summary card */}
      <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.02] px-4 py-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--on-surface))]/30">รหัสสัญญา</span>
          <span className="font-mono text-[11px] text-[hsl(var(--on-surface))]/50">{contract.id.slice(0, 8)}…</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--on-surface))]/30">ผู้เช่า</span>
          <span className="text-[12px] font-medium text-[hsl(var(--on-surface))]">{contract.primaryTenant?.fullName ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--on-surface))]/30">สถานะ</span>
          <StatusBadge status={displayStatus} />
        </div>
        {contract.terminationReason && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--on-surface))]/30 shrink-0">เหตุผล</span>
            <span className="text-[11px] text-[hsl(var(--on-surface))]/70 text-right">{contract.terminationReason}</span>
          </div>
        )}
      </div>

      {contract.status !== 'ACTIVE' && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-400 backdrop-blur-sm">
          <AlertCircle size={13} className="shrink-0" />
          สามารถแก้ไขได้เฉพาะสัญญาที่ใช้งานอยู่เท่านั้น สัญญานี้มีสถานะ <strong>{contract.status}</strong>.
        </div>
      )}

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">วันที่เริ่ม</label>
          <ThaiDateInput
            ariaLabel="วันที่เริ่ม"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            disabled={contract.status !== 'ACTIVE'}
            value={form.startDate}
            onChange={(iso) => patch('startDate', iso)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">วันที่สิ้นสุด</label>
          <ThaiDateInput
            ariaLabel="วันที่สิ้นสุด"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            disabled={contract.status !== 'ACTIVE'}
            value={form.endDate}
            onChange={(iso) => patch('endDate', iso)}
          />
        </div>
      </div>

      {/* Rent & Deposit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">ค่าเช่ารายเดือน (฿)</label>
          <CurrencyInput
            ariaLabel="ค่าเช่ารายเดือน"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            disabled={contract.status !== 'ACTIVE'}
            value={form.rentAmount === '' ? null : Number(form.rentAmount)}
            onChange={(n) => patch('rentAmount', n === null ? '' : String(n))}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">เงินมัดจำ (฿)</label>
          <CurrencyInput
            ariaLabel="เงินมัดจำ"
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
            disabled={contract.status !== 'ACTIVE'}
            value={form.depositAmount === '' ? null : Number(form.depositAmount)}
            onChange={(n) => patch('depositAmount', n === null ? '' : String(n))}
          />
        </div>
      </div>

      {/* Error / success */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-xs font-medium text-red-400 backdrop-blur-sm">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-xs font-medium text-emerald-400 backdrop-blur-sm">
          <CheckCircle2 size={13} />
          {success}
        </div>
      )}

      {/* Renew Form */}
      {showRenewForm && contract.status === 'ACTIVE' && (
        <form onSubmit={onRenewSubmit} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-blue-400">ต่อสัญญา</span>
            <button type="button" onClick={onCloseRenewForm} className="text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))] transition-colors">
              <X size={14} />
            </button>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">
              วันที่สิ้นสุดสัญญาใหม่ <span className="text-red-400">*</span>
            </label>
            <ThaiDateInput
              ariaLabel="วันที่สิ้นสุดสัญญาใหม่"
              className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
              required
              value={renewEndDate}
              onChange={(iso) => setRenewEndDate(iso)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">ค่าเช่าใหม่ (฿)</label>
              <CurrencyInput
                ariaLabel="ค่าเช่าใหม่"
                className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                value={renewRentAmount === '' ? null : Number(renewRentAmount)}
                onChange={(n) => setRenewRentAmount(n === null ? '' : String(n))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">เงินมัดจำใหม่ (฿)</label>
              <CurrencyInput
                ariaLabel="เงินมัดจำใหม่"
                className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                value={renewDepositAmount === '' ? null : Number(renewDepositAmount)}
                onChange={(n) => setRenewDepositAmount(n === null ? '' : String(n))}
              />
            </div>
          </div>
          {renewError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-400 backdrop-blur-sm">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>{renewError}</span>
            </div>
          )}
          {renewSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-400 backdrop-blur-sm">
              <CheckCircle2 size={12} />
              {renewSuccess}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCloseRenewForm}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--color-surface))]/[0.1] active:scale-[0.98]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={renewSaving || !renewEndDate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 px-4 py-1.5 text-xs font-semibold text-blue-400 shadow-sm transition-all duration-200 hover:bg-blue-500/30 active:scale-[0.98] disabled:opacity-50"
            >
              {renewSaving ? (
                <>
                  <RefreshCw size={11} className="animate-spin" />
                  กำลังบันทึก…
                </>
              ) : (
                <>
                  <CheckCircle2 size={11} />
                  ยืนยันต่อสัญญา
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        {contract.status === 'ACTIVE' && !showRenewForm && !showTerminateDialog && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenTerminateForm}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 shadow-sm transition-all duration-200 hover:bg-red-500/20 hover:border-red-500/40 active:scale-[0.98]"
            >
              <XCircle size={12} />
              ยกเลิกสัญญา
            </button>
            <button
              type="button"
              onClick={onOpenRenewForm}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-400 shadow-sm transition-all duration-200 hover:bg-blue-500/20 active:scale-[0.98]"
            >
              <FileSignature size={12} />
              ต่อสัญญา
            </button>
          </div>
        )}
        <div className="flex items-center justify-end gap-2 ml-auto">
          <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--color-surface))]/[0.1] hover:border-[hsl(var(--color-border))] active:scale-[0.98]" onClick={onCancel}>
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={saving || contract.status !== 'ACTIVE'}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-500/20 border border-blue-500/30 px-5 py-2 text-sm font-semibold text-blue-400 shadow-sm transition-all duration-200 hover:bg-blue-500/30 hover:border-blue-500/50 active:scale-[0.98] disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                กำลังบันทึก…
              </>
            ) : (
              <>
                <ChevronRight size={13} />
                อัปเดตสัญญา
              </>
            )}
          </button>
        </div>
      </div>

      {/* Terminate Dialog */}
      {showTerminateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onCloseTerminateForm} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/95 p-6 shadow-[0_4px_20px_rgba(0,0,0,0.12)] backdrop-blur">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/20 border border-red-500/30">
                <XCircle size={20} className="text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">ยกเลิกสัญญา</h2>
                <p className="mt-1.5 text-sm text-[hsl(var(--on-surface))]/50">กรุณาระบุวันที่และเหตุผลในการยกเลิกสัญญานี้</p>
              </div>
              <button
                onClick={onCloseTerminateForm}
                className="shrink-0 rounded-full p-1 text-[hsl(var(--on-surface-variant))] transition-all hover:bg-[hsl(var(--color-surface))] hover:text-[hsl(var(--on-surface))]"
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={onTerminateSubmit} className="mt-6 flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">
                  วันที่ยกเลิก <span className="text-red-400">*</span>
                </label>
                <ThaiDateInput
                  ariaLabel="วันที่ยกเลิก"
                  className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                  required
                  value={terminateDate}
                  onChange={(iso) => setTerminateDate(iso)}
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[hsl(var(--on-surface))]/70">เหตุผล</label>
                <textarea
                  className="w-full resize-none rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface))]/30 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 backdrop-blur-sm transition-all duration-200"
                  rows={3}
                  placeholder="ระบุเหตุผลการยกเลิกสัญญา…"
                  value={terminateReason}
                  onChange={(e) => setTerminateReason(e.target.value)}
                />
              </div>
              {terminateError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 backdrop-blur-sm">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{terminateError}</span>
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={onCloseTerminateForm}
                  className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))]/70 shadow-sm transition-all duration-200 hover:bg-[hsl(var(--color-surface))]/[0.1] active:scale-[0.98]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={terminateSaving || !terminateDate}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 shadow-sm transition-all duration-200 hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {terminateSaving ? (
                    <>
                      <RefreshCw size={11} className="animate-spin" />
                      กำลังบันทึก…
                    </>
                  ) : (
                    <>
                      <XCircle size={11} />
                      ยืนยันยกเลิกสัญญา
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </form>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew, hasFilter }: { onNew: () => void; hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))]">
        <FileSignature size={28} className="text-[hsl(var(--on-surface))]/30" strokeWidth={1.5} />
      </div>
      <h3 className="text-[15px] font-semibold text-[hsl(var(--on-surface))]">
        {hasFilter ? 'ไม่พบสัญญาที่ตรงกับตัวกรอง' : 'ยังไม่มีสัญญา'}
      </h3>
      <p className="mt-1 max-w-xs text-[13px] text-[hsl(var(--on-surface-variant))]">
        {hasFilter
          ? 'ลองล้างการค้นหาหรือเปลี่ยนตัวกรองสถานะ'
          : 'สร้างสัญญาเช่าแรกของคุณโดยคลิกปุ่มด้านล่าง'}
      </p>
      {!hasFilter && (
        <button
          onClick={onNew}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-500/20 border border-blue-500/30 px-5 py-2 text-sm font-semibold text-blue-400 shadow-sm transition-all duration-200 hover:bg-blue-500/30 hover:border-blue-500/50 mt-5 active:scale-[0.98]"
        >
          <Plus size={14} strokeWidth={2.5} />
          สร้างสัญญาใหม่
        </button>
      )}
    </div>
  );
}
