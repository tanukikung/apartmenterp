'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Search,
  Plus,
  X,
  ChevronRight,
  FileSignature,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Pencil,
  RefreshCw,
} from 'lucide-react';

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
  const cfg = {
    ACTIVE:        { label: 'Active',         cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200',  Icon: CheckCircle2 },
    EXPIRING_SOON: { label: 'Expiring Soon',  cls: 'bg-amber-100 text-amber-800 border border-amber-200',       Icon: Clock },
    EXPIRED:       { label: 'Expired',        cls: 'bg-red-100 text-red-700 border border-red-200',             Icon: XCircle },
    TERMINATED:    { label: 'Terminated',     cls: 'bg-slate-100 text-slate-600 border border-slate-200',       Icon: XCircle },
  }[status];

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.cls}`}>
      <cfg.Icon size={10} />
      {cfg.label}
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
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="admin-card flex items-center gap-4 py-4 px-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon size={20} className="text-white" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-800 leading-tight">{value}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminContractsPage() {
  // Data state
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Room / tenant options for new contract form
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [roomTenantsMap, setRoomTenantsMap] = useState<Record<string, TenantOption[]>>({});
  const [tenantsLoading, setTenantsLoading] = useState(false);

  // ── Load contracts ──────────────────────────────────────────────────────────

  const loadContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
      });
      // The API supports filtering by status but not a free-text search field —
      // we'll post-filter client-side for name/room search.
      if (filterStatus && filterStatus !== 'EXPIRING_SOON') {
        params.set('status', filterStatus);
      }
      const res = await fetch(`/api/contracts?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { success: boolean; data: ContractListResponse } = await res.json();
      if (!json.success) throw new Error('API returned failure');
      setContracts(json.data.data);
      setTotal(json.data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load contracts');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  // ── Load rooms for "New" form ───────────────────────────────────────────────

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms?pageSize=300&roomStatus=ACTIVE');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setRooms(json.data.data ?? []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    if (panelMode === 'new') void loadRooms();
  }, [panelMode, loadRooms]);

  // ── Load tenants when room is selected ─────────────────────────────────────

  const loadTenantsForRoom = useCallback(
    async (roomNo: string) => {
      if (!roomNo || roomTenantsMap[roomNo]) return;
      setTenantsLoading(true);
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomNo)}/tenants`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) {
          // getTenantsByRoom returns TenantResponse[] with optional roomTenants
          const tenants: TenantOption[] = (json.data as TenantOption[]).map((t) => ({
            id: t.id,
            firstName: t.firstName,
            lastName: t.lastName,
            fullName: t.fullName ?? `${t.firstName} ${t.lastName}`,
            phone: t.phone,
          }));
          setRoomTenantsMap((prev) => ({ ...prev, [roomNo]: tenants }));
        }
      } catch {
        // non-critical
      } finally {
        setTenantsLoading(false);
      }
    },
    [roomTenantsMap]
  );

  // ── Derived / computed ──────────────────────────────────────────────────────

  const filteredContracts = useMemo(() => {
    let list = contracts;

    // Client-side search (room number / tenant name)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.roomNo.toLowerCase().includes(q) ||
          (c.primaryTenant?.fullName ?? '').toLowerCase().includes(q)
      );
    }

    // Client-side "Expiring Soon" filter (server doesn't expose it directly)
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
        throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
      }
      closePanel();
      void loadContracts();
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'Failed to create contract');
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
      if (res.status === 404) {
        throw new Error('Update endpoint not yet available. Please contact your developer.');
      }
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
      }
      setEditSuccess('Contract updated successfully.');
      void loadContracts();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update contract');
    } finally {
      setEditSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const selectedTenants = newForm.roomId ? (roomTenantsMap[newForm.roomId] ?? []) : [];

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Main content ─────────────────────────────────────────── */}
      <main
        className={`admin-page flex-1 min-w-0 transition-all duration-200 ${
          panelMode !== 'none' ? 'mr-0 xl:mr-[420px]' : ''
        }`}
      >
        {/* Header */}
        <section className="admin-page-header">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 shadow-sm">
              <FileSignature size={20} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="admin-page-title">Contracts</h1>
              <p className="admin-page-subtitle">Manage lease agreements for all occupied rooms</p>
            </div>
          </div>
          <div className="admin-toolbar">
            <button
              className="admin-button flex items-center gap-1.5"
              onClick={() => void loadContracts()}
              title="Refresh"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
            <button
              className="admin-button admin-button-primary flex items-center gap-1.5"
              onClick={openNew}
            >
              <Plus size={14} strokeWidth={2.5} />
              New Contract
            </button>
          </div>
        </section>

        {/* KPI Row */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-1">
          <KpiCard
            label="Total Contracts"
            value={kpis.total}
            sub="all time"
            color="bg-indigo-500"
            icon={FileText}
          />
          <KpiCard
            label="Active"
            value={kpis.active}
            sub="currently running"
            color="bg-emerald-500"
            icon={CheckCircle2}
          />
          <KpiCard
            label="Expiring Soon"
            value={kpis.expiringSoon}
            sub="within 30 days"
            color="bg-amber-500"
            icon={Clock}
          />
          <KpiCard
            label="Expired"
            value={kpis.expired}
            sub="past end date"
            color="bg-red-400"
            icon={XCircle}
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-4 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="admin-input pl-8 w-full"
              placeholder="Search room number or tenant name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="admin-select"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRING_SOON">Expiring Soon</option>
            <option value="EXPIRED">Expired</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        {/* Table */}
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="admin-table w-full">
              <thead>
                <tr>
                  <th className="pl-4">Room No</th>
                  <th>Tenant Name</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Monthly Rent</th>
                  <th>Deposit</th>
                  <th>Status</th>
                  <th className="pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}>
                          <div className="h-4 rounded bg-slate-100 animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
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
                        ? 'bg-amber-50/60'
                        : displayStatus === 'EXPIRED'
                        ? 'bg-red-50/40'
                        : displayStatus === 'TERMINATED'
                        ? 'bg-slate-50/80'
                        : '';
                    const isSelected = selectedContract?.id === c.id && panelMode === 'edit';
                    return (
                      <tr
                        key={c.id}
                        className={`${rowCls} ${isSelected ? 'ring-2 ring-inset ring-indigo-400' : ''} cursor-pointer hover:bg-slate-50`}
                        onClick={() => openEdit(c)}
                      >
                        <td className="pl-4 font-semibold text-slate-800">
                          {c.roomNo}
                        </td>
                        <td>
                          <div className="font-medium text-slate-800">
                            {c.primaryTenant?.fullName ?? '—'}
                          </div>
                          {c.primaryTenant?.phone && (
                            <div className="text-[11px] text-slate-400">{c.primaryTenant.phone}</div>
                          )}
                        </td>
                        <td className="text-slate-600">{fmtDate(c.startDate)}</td>
                        <td className="text-slate-600">
                          <span>{fmtDate(c.endDate)}</span>
                          {displayStatus === 'EXPIRING_SOON' && (
                            <span className="ml-1.5 text-[11px] font-semibold text-amber-600">
                              ({daysUntil(c.endDate)}d)
                            </span>
                          )}
                        </td>
                        <td className="font-medium text-slate-800">{fmtMoney(c.rentAmount)}</td>
                        <td className="text-slate-600">{fmtMoney(c.depositAmount)}</td>
                        <td>
                          <StatusBadge status={displayStatus} />
                        </td>
                        <td className="pr-4 text-right">
                          <button
                            className="admin-button flex items-center gap-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(c);
                            }}
                          >
                            <Pencil size={11} />
                            Edit
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
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <span className="text-xs text-slate-400">
                Showing {filteredContracts.length} of {total} contracts
              </span>
              <div className="flex items-center gap-1">
                <button
                  className="admin-button text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span className="px-2 text-xs text-slate-500">Page {page}</span>
                <button
                  className="admin-button text-xs"
                  disabled={filteredContracts.length < 50}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Side Panel ───────────────────────────────────────────── */}
      {panelMode !== 'none' && (
        <aside className="fixed right-0 top-0 z-30 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl xl:w-[420px]">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              {panelMode === 'new' ? (
                <Plus size={16} className="text-indigo-600" />
              ) : (
                <Pencil size={15} className="text-indigo-600" />
              )}
              <span className="text-[15px] font-semibold text-slate-800">
                {panelMode === 'new' ? 'New Contract' : `Edit — Room ${selectedContract?.roomNo}`}
              </span>
            </div>
            <button
              onClick={closePanel}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
                  void loadTenantsForRoom(roomNo);
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
              />
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
      <p className="text-[12px] text-slate-500 leading-relaxed">
        Create a new lease contract. The selected tenant must be the <strong>PRIMARY</strong> tenant
        of the chosen room, with no existing active contract for that room.
      </p>

      {/* Room select */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-slate-700">
          Room Number <span className="text-red-500">*</span>
        </label>
        <select
          className="admin-select w-full"
          required
          value={form.roomId}
          onChange={(e) => onRoomChange(e.target.value)}
        >
          <option value="">— Select room —</option>
          {rooms.map((r) => (
            <option key={r.roomNo} value={r.roomNo}>
              {r.roomNo} (Floor {r.floorNo})
            </option>
          ))}
        </select>
      </div>

      {/* Tenant select */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-slate-700">
          Primary Tenant <span className="text-red-500">*</span>
        </label>
        {tenantsLoading ? (
          <div className="flex h-9 items-center rounded-md border border-slate-200 px-3 text-xs text-slate-400 animate-pulse">
            Loading tenants…
          </div>
        ) : (
          <select
            className="admin-select w-full"
            required
            disabled={!form.roomId}
            value={form.primaryTenantId}
            onChange={(e) => patch('primaryTenantId', e.target.value)}
          >
            <option value="">— Select tenant —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName} · {t.phone}
              </option>
            ))}
          </select>
        )}
        {form.roomId && !tenantsLoading && tenants.length === 0 && (
          <p className="mt-1 text-[11px] text-amber-600">
            No tenants found for this room. Assign a PRIMARY tenant first.
          </p>
        )}
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700">
            Start Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            className="admin-input w-full"
            required
            value={form.startDate}
            onChange={(e) => patch('startDate', e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700">
            End Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            className="admin-input w-full"
            required
            value={form.endDate}
            onChange={(e) => patch('endDate', e.target.value)}
          />
        </div>
      </div>

      {/* Rent & Deposit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700">
            Monthly Rent (฿) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            max="999999"
            step="0.01"
            className="admin-input w-full"
            required
            placeholder="e.g. 8000"
            value={form.rentAmount}
            onChange={(e) => patch('rentAmount', e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700">
            Deposit (฿)
          </label>
          <input
            type="number"
            min="0"
            max="999999"
            step="0.01"
            className="admin-input w-full"
            placeholder="e.g. 16000"
            value={form.depositAmount}
            onChange={(e) => patch('depositAmount', e.target.value)}
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-[12px] font-semibold text-slate-700">Notes</label>
        <textarea
          className="admin-input w-full resize-none"
          rows={3}
          placeholder="Optional notes about this contract…"
          value={form.notes}
          onChange={(e) => patch('notes', e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" className="admin-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="admin-button admin-button-primary flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <ChevronRight size={13} />
              Save Contract
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
}: {
  contract: ContractRecord;
  form: typeof EMPTY_EDIT_FORM;
  setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_EDIT_FORM>>;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  success: string | null;
  onCancel: () => void;
}) {
  const patch = (k: keyof typeof EMPTY_EDIT_FORM, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const displayStatus = resolveDisplayStatus(contract);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Contract summary card */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contract ID</span>
          <span className="font-mono text-[11px] text-slate-600">{contract.id.slice(0, 8)}…</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tenant</span>
          <span className="text-[12px] font-medium text-slate-800">{contract.primaryTenant?.fullName ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</span>
          <StatusBadge status={displayStatus} />
        </div>
        {contract.terminationReason && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 shrink-0">Reason</span>
            <span className="text-[11px] text-slate-600 text-right">{contract.terminationReason}</span>
          </div>
        )}
      </div>

      {contract.status !== 'ACTIVE' && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <AlertCircle size={13} className="shrink-0" />
          Only active contracts can be edited. This contract is <strong>{contract.status}</strong>.
        </div>
      )}

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700">Start Date</label>
          <input
            type="date"
            className="admin-input w-full"
            disabled={contract.status !== 'ACTIVE'}
            value={form.startDate}
            onChange={(e) => patch('startDate', e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700">End Date</label>
          <input
            type="date"
            className="admin-input w-full"
            disabled={contract.status !== 'ACTIVE'}
            value={form.endDate}
            onChange={(e) => patch('endDate', e.target.value)}
          />
        </div>
      </div>

      {/* Rent & Deposit */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700">Monthly Rent (฿)</label>
          <input
            type="number"
            min="1"
            max="999999"
            step="0.01"
            className="admin-input w-full"
            disabled={contract.status !== 'ACTIVE'}
            value={form.rentAmount}
            onChange={(e) => patch('rentAmount', e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-slate-700">Deposit (฿)</label>
          <input
            type="number"
            min="0"
            max="999999"
            step="0.01"
            className="admin-input w-full"
            disabled={contract.status !== 'ACTIVE'}
            value={form.depositAmount}
            onChange={(e) => patch('depositAmount', e.target.value)}
          />
        </div>
      </div>

      {/* Error / success */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
          <CheckCircle2 size={13} />
          {success}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" className="admin-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || contract.status !== 'ACTIVE'}
          className="admin-button admin-button-primary flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <ChevronRight size={13} />
              Update Contract
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onNew, hasFilter }: { onNew: () => void; hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
        <FileSignature size={28} className="text-slate-400" strokeWidth={1.5} />
      </div>
      <h3 className="text-[15px] font-semibold text-slate-700">
        {hasFilter ? 'No contracts match your filters' : 'No contracts yet'}
      </h3>
      <p className="mt-1 max-w-xs text-[13px] text-slate-400">
        {hasFilter
          ? 'Try clearing the search or changing the status filter.'
          : 'Create your first lease contract by clicking the button below.'}
      </p>
      {!hasFilter && (
        <button
          onClick={onNew}
          className="admin-button admin-button-primary mt-5 flex items-center gap-1.5"
        >
          <Plus size={14} strokeWidth={2.5} />
          New Contract
        </button>
      )}
    </div>
  );
}
