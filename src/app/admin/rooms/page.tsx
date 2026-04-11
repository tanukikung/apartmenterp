'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Plus, X, DoorOpen, Search, ExternalLink } from 'lucide-react';
import { useApiData } from '@/hooks/useApi';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CardGrid } from '@/components/ui/card-grid';
import { ModernTable, ColumnDef } from '@/components/ui/modern-table';
import { StatusBadge, roomStatusVariant } from '@/components/ui/status-badge';

type Room = {
  roomNo: string;
  floorNo: number;
  defaultAccountId: string;
  defaultRuleCode: string;
  defaultRentAmount: number;
  hasFurniture: boolean;
  defaultFurnitureAmount: number;
  roomStatus: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'OWNER_USE';
  lineUserId: string | null;
};

type BankAccount = {
  id: string;
  name: string;
  bankName: string;
  bankAccountNo: string;
};

type BillingRule = {
  code: string;
  descriptionTh: string;
};

type Floor = {
  floorNo: number;
  label: string;
};

type RoomStatusCounts = {
  VACANT: number;
  OCCUPIED: number;
  MAINTENANCE: number;
  OWNER_USE: number;
};

type RoomList = {
  data: Room[];
  total: number;
  statusCounts?: RoomStatusCounts;
};

const createDefaults = {
  roomNo: '',
  floorNo: '2',
  defaultAccountId: '',
  defaultRuleCode: '',
  defaultRentAmount: '3000',
  hasFurniture: false,
  roomStatus: 'VACANT' as Room['roomStatus'],
};

type DrawerMode = 'create' | 'edit' | null;

export default function AdminRoomsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [floorFilter, setFloorFilter] = useState<number | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [createForm, setCreateForm] = useState(createDefaults);
  const [editForm, setEditForm] = useState({ floorNo: 2, defaultRentAmount: '3000', hasFurniture: false, defaultFurnitureAmount: '0', defaultAccountId: '', defaultRuleCode: '', roomStatus: 'VACANT' as Room['roomStatus'] });
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);

  // Confirm dialogs
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description?: string; onConfirm: () => void } | null>(null);

  // React Query for rooms data
  const roomsQueryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '300',
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(statusFilter ? { roomStatus: statusFilter } : {}),
    });
    return `/api/rooms?${params.toString()}`;
  }, [search, statusFilter]);

  const { data: roomsData, isLoading: loading, refetch } = useApiData<RoomList>(roomsQueryParams, ['rooms']);

  // Meta queries for dropdowns
  const { data: accountsData } = useApiData<BankAccount[]>('/api/bank-accounts', ['bank-accounts']);
  const { data: rulesData } = useApiData<BillingRule[]>('/api/billing-rules', ['billing-rules']);
  const { data: floorsData } = useApiData<Floor[]>('/api/floors', ['floors']);

  // Sync meta into form defaults when they load
  useEffect(() => {
    if (accountsData) {
      setAccounts(accountsData);
      setCreateForm((prev) => ({ ...prev, defaultAccountId: accountsData[0]?.id ?? '' }));
    }
  }, [accountsData]);

  useEffect(() => {
    if (rulesData) {
      setRules(rulesData);
      setCreateForm((prev) => ({ ...prev, defaultRuleCode: rulesData[0]?.code ?? '' }));
    }
  }, [rulesData]);

  useEffect(() => {
    if (floorsData) setFloors(floorsData);
  }, [floorsData]);

  // Auto-open edit drawer when ?edit=<roomNo> is in the URL
  useEffect(() => {
    if (!roomsData?.data) return;
    const editRoomNo = new URLSearchParams(window.location.search).get('edit');
    if (editRoomNo) {
      const room = roomsData.data.find((r) => r.roomNo === editRoomNo);
      if (room) setSelectedRoom(room);
    }
  }, [roomsData]);

  useEffect(() => {
    if (selectedRoom) {
      setEditForm({
        floorNo: selectedRoom.floorNo,
        defaultRentAmount: String(selectedRoom.defaultRentAmount),
        hasFurniture: selectedRoom.hasFurniture,
        defaultFurnitureAmount: String(selectedRoom.defaultFurnitureAmount),
        defaultAccountId: selectedRoom.defaultAccountId,
        defaultRuleCode: selectedRoom.defaultRuleCode,
        roomStatus: selectedRoom.roomStatus,
      });
      setDrawerMode('edit');
    }
  }, [selectedRoom]);

  const stats = useMemo(() => ({
    total: roomsData?.total ?? 0,
    occupied: roomsData?.statusCounts?.OCCUPIED ?? 0,
    available: (roomsData?.statusCounts?.VACANT ?? 0) + (roomsData?.statusCounts?.OCCUPIED ?? 0),
    unavailable: (roomsData?.statusCounts?.MAINTENANCE ?? 0) + (roomsData?.statusCounts?.OWNER_USE ?? 0),
  }), [roomsData]);

  const filteredRooms = useMemo(() => {
    if (!roomsData?.data) return [];
    const rooms = floorFilter === null ? roomsData.data : roomsData.data.filter(r => r.floorNo === floorFilter);
    return [...rooms].sort((a, b) => {
      if (a.floorNo !== b.floorNo) return a.floorNo - b.floorNo;
      const numA = parseInt(a.roomNo.replace(/.*\//, ''), 10);
      const numB = parseInt(b.roomNo.replace(/.*\//, ''), 10);
      return numA - numB;
    });
  }, [roomsData, floorFilter]);

  function closeDrawer() {
    setDrawerMode(null);
    setSelectedRoom(null);
  }

  async function createRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setWorking('create');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNo: createForm.roomNo,
          floorNo: Number(createForm.floorNo),
          defaultAccountId: createForm.defaultAccountId,
          defaultRuleCode: createForm.defaultRuleCode,
          defaultRentAmount: Number(createForm.defaultRentAmount),
          hasFurniture: createForm.hasFurniture,
          roomStatus: createForm.roomStatus,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถสร้างห้องได้');
      setMessage(`ห้อง ${createForm.roomNo} สร้างสำเร็จ`);
      setCreateForm((prev) => ({ ...prev, roomNo: '' }));
      closeDrawer();
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถสร้างห้องได้');
    } finally {
      setWorking(null);
    }
  }

  async function updateRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedRoom) return;
    setWorking(`edit:${selectedRoom.roomNo}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(selectedRoom.roomNo)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorNo: Number(editForm.floorNo),
          defaultRentAmount: Number(editForm.defaultRentAmount),
          hasFurniture: editForm.hasFurniture,
          defaultFurnitureAmount: Number(editForm.defaultFurnitureAmount),
          defaultAccountId: editForm.defaultAccountId,
          defaultRuleCode: editForm.defaultRuleCode,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถอัพเดทห้องได้');
      setMessage(`ห้อง ${selectedRoom.roomNo} อัพเดทสำเร็จ`);
      closeDrawer();
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถอัพเดทห้องได้');
    } finally {
      setWorking(null);
    }
  }

  async function deleteRoom() {
    if (!selectedRoom) return;
    const roomNo = selectedRoom.roomNo;
    setConfirmDialog({
      open: true,
      title: `ลบห้อง ${roomNo}?`,
      description: 'ไม่สามารถย้อนกลับได้',
      onConfirm: async () => {
        setConfirmDialog(null);
        setWorking(`delete:${roomNo}`);
        setMessage(null);
        setError(null);
        try {
          const res = await fetch(`/api/rooms/${encodeURIComponent(roomNo)}`, {
            method: 'DELETE',
          }).then((r) => r.json());
          if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถลบห้องได้');
          setMessage(`ห้อง ${roomNo} ลบสำเร็จ`);
          closeDrawer();
          await refetch();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'ไม่สามารถลบห้องได้');
        } finally {
          setWorking(null);
        }
      },
    });
  }

  async function updateStatus(roomNo: string, nextStatus: Room['roomStatus']) {
    if (nextStatus === 'MAINTENANCE' || nextStatus === 'OWNER_USE') {
      setConfirmDialog({
        open: true,
        title: `เปลี่ยนสถานะห้อง ${roomNo} เป็น "${nextStatus === 'MAINTENANCE' ? 'ซ่อมบำรุง' : 'ใช้เอง'}"?`,
        description: 'ห้องจะถูกนำออกจากสระห้องว่าง และไม่สามารถจัดสรรผู้เช่าใหม่ได้',
        onConfirm: async () => {
          setConfirmDialog(null);
          setWorking(`status:${roomNo}`);
          setError(null);
          setMessage(null);
          try {
            const res = await fetch(`/api/rooms/${encodeURIComponent(roomNo)}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomStatus: nextStatus }),
            }).then((r) => r.json());
            if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถอัพเดทสถานะได้');
            setMessage(`สถานะห้อง ${roomNo} เปลี่ยนสำเร็จ`);
            await refetch();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'ไม่สามารถอัพเดทสถานะได้');
          } finally {
            setWorking(null);
          }
        },
      });
      return;
    }
    setWorking(`status:${roomNo}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomNo)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomStatus: nextStatus }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถอัพเดทสถานะได้');
      setMessage(`สถานะห้อง ${roomNo} เปลี่ยนสำเร็จ`);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถอัพเดทสถานะได้');
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="p-8 max-w-7xl mx-auto w-full space-y-6">

      {/* ── Header ── */}
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--primary)]">ห้องพัก</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">จัดการห้องพัก สร้าง แก้ไข และเปลี่ยนสถานะ</p>
        </div>
        <button
          onClick={() => { setDrawerMode('create'); setSelectedRoom(null); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all"
        >
          <Plus size={14} strokeWidth={2.5} />
          เพิ่มห้อง
        </button>
      </section>

      {/* ── KPI Stats ── */}
      <section className="grid gap-4 sm:grid-cols-4">
        <div className="bg-[var(--surface-container-lowest)] p-5 rounded-xl border border-[var(--outline-variant)]/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">ทั้งหมด</p>
          <div className="text-2xl font-extrabold tracking-tight text-[var(--primary)]">{stats.total}</div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] p-5 rounded-xl border border-[var(--outline-variant)]/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">ว่าง</p>
          <div className="text-2xl font-extrabold tracking-tight text-emerald-600">{roomsData?.statusCounts?.VACANT ?? 0}</div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] p-5 rounded-xl border border-[var(--outline-variant)]/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">มีผู้เช่า</p>
          <div className="text-2xl font-extrabold tracking-tight text-blue-600">{roomsData?.statusCounts?.OCCUPIED ?? 0}</div>
        </div>
        <div className="bg-[var(--surface-container-lowest)] p-5 rounded-xl border border-[var(--outline-variant)]/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">ไม่ว่าง/ซ่อม</p>
          <div className="text-2xl font-extrabold tracking-tight text-amber-600">{stats.unavailable}</div>
        </div>
      </section>

      {/* ── Toolbar ── */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--on-surface-variant)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all"
            placeholder="ค้นหาเลขห้อง..."
          />
        </div>
        <select
          className="px-3 py-2 bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">ทุกสถานะ</option>
          <option value="VACANT">ว่าง</option>
          <option value="OCCUPIED">มีผู้เช่า</option>
          <option value="MAINTENANCE">ซ่อมบำรุง</option>
          <option value="OWNER_USE">ใช้เอง</option>
        </select>
        <div className="flex items-center gap-1 bg-[var(--surface-container-low)] rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-[var(--surface-container-lowest)] shadow-sm text-[var(--primary)]' : 'text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]'}`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded transition-all ${viewMode === 'table' ? 'bg-[var(--surface-container-lowest)] shadow-sm text-[var(--primary)]' : 'text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]'}`}
          >
            <List size={16} />
          </button>
        </div>
      </section>

      {/* ── Floor Filter Pills ── */}
      {floors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${floorFilter === null ? 'bg-primary text-white shadow-md' : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]'}`}
            onClick={() => setFloorFilter(null)}
          >
            ทุกชั้น
          </button>
          {floors.map(f => (
            <button
              key={f.floorNo}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${floorFilter === f.floorNo ? 'bg-primary text-white shadow-md' : 'bg-[var(--surface-container-low)] text-[var(--on-surface-variant)] hover:bg-[var(--surface-container-high)]'}`}
              onClick={() => setFloorFilter(f.floorNo)}
            >
              ชั้น {f.floorNo}
            </button>
          ))}
        </div>
      )}

      {/* ── Alerts ── */}
      {message && (
        <div className="px-4 py-3 rounded-lg bg-[var(--tertiary-container)]/10 border border-[var(--tertiary-container)]/20 text-sm text-[var(--tertiary-container)] font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-[var(--error-container)]/10 border border-[var(--error-container)]/20 text-sm text-[var(--color-danger)] font-medium">
          {error}
        </div>
      )}

      {/* ── Room Content ── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      ) : !filteredRooms.length ? (
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-12 text-center">
          <DoorOpen size={40} className="mx-auto text-[var(--on-surface-variant)] mb-4" />
          <div className="text-sm font-semibold text-[var(--on-surface-variant)]">ไม่พบห้อง</div>
          <div className="text-xs text-[var(--on-surface-variant)] mt-1">ลองเปลี่ยนตัวกรองหรือเพิ่มห้องใหม่</div>
        </div>
      ) : viewMode === 'grid' ? (
        <CardGrid
          items={filteredRooms}
          columns={4}
          idKey="roomNo"
          getCardMeta={(room) => ({
            title: room.roomNo,
            subtitle: `ชั้น ${room.floorNo}`,
            badge: (
              <StatusBadge variant={roomStatusVariant(room.roomStatus)} dot>
                {room.roomStatus === 'VACANT' ? 'ว่าง' :
                 room.roomStatus === 'OCCUPIED' ? 'มีผู้เช่า' :
                 room.roomStatus === 'MAINTENANCE' ? 'ซ่อมบำรุง' : 'ใช้เอง'}
              </StatusBadge>
            ),
            stats: [
              { label: 'ค่าเช่า', value: `฿${Number(room.defaultRentAmount).toLocaleString()}` },
            ],
            footer: (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--on-surface-variant)]">ค่าเช่าเริ่มต้น</span>
                <Link
                  href={`/admin/rooms/${encodeURIComponent(room.roomNo)}`}
                  className="text-xs font-semibold text-[var(--primary)] hover:text-indigo-800 transition-colors flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  ดูรายละเอียด <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ),
          })}
          onCardClick={(room) => setSelectedRoom(room)}
          loading={loading}
          empty={
            <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-12 text-center">
              <DoorOpen size={40} className="mx-auto text-[var(--on-surface-variant)] mb-4" />
              <div className="text-sm font-semibold text-[var(--on-surface-variant)]">ไม่พบห้อง</div>
              <div className="text-xs text-[var(--on-surface-variant)] mt-1">ลองเปลี่ยนตัวกรองหรือเพิ่มห้องใหม่</div>
            </div>
          }
        />
      ) : (
        <ModernTable
          idKey="roomNo"
          columns={[
            { key: 'roomNo', header: 'เลขห้อง', sortable: true },
            { key: 'floorNo', header: 'ชั้น', sortable: true, render: (r) => `ชั้น ${r.floorNo}` },
            {
              key: 'roomStatus', header: 'สถานะ', sortable: true,
              render: (r) => (
                <StatusBadge variant={roomStatusVariant(r.roomStatus)} dot>
                  {r.roomStatus === 'VACANT' ? 'ว่าง' :
                   r.roomStatus === 'OCCUPIED' ? 'มีผู้เช่า' :
                   r.roomStatus === 'MAINTENANCE' ? 'ซ่อมบำรุง' : 'ใช้เอง'}
                </StatusBadge>
              ),
            },
            { key: 'defaultRentAmount', header: 'ค่าเช่า', sortable: true, align: 'right', render: (r) => `฿${Number(r.defaultRentAmount).toLocaleString()}` },
          ]}
          data={filteredRooms}
          onRowClick={(room) => setSelectedRoom(room)}
          actions={[
            {
              label: 'ดู →',
              onClick: (room) => {
                window.location.href = `/admin/rooms/${encodeURIComponent(room.roomNo)}`;
              },
            },
          ]}
          loading={loading}
          empty={
            <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 p-12 text-center">
              <DoorOpen size={40} className="mx-auto text-[var(--on-surface-variant)] mb-4" />
              <div className="text-sm font-semibold text-[var(--on-surface-variant)]">ไม่พบห้อง</div>
            </div>
          }
        />
      )}

      {/* ── Drawer ── */}
      {drawerMode && (
        <>
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40" onClick={closeDrawer} style={{ animation: 'fade-in 200ms ease' }} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[var(--surface-container-lowest)] border-l border-[var(--outline-variant)]/10 z-50 overflow-y-auto" style={{ animation: 'slide-in-right 250ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="sticky top-0 bg-[var(--surface-container-lowest)] border-b border-[var(--outline-variant)]/10 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-[var(--primary)]">
                {drawerMode === 'create' ? 'เพิ่มห้องใหม่' : `แก้ไขห้อง ${selectedRoom?.roomNo}`}
              </h2>
              <button onClick={closeDrawer} className="p-2 hover:bg-[var(--surface-container-high)] rounded-lg transition-colors">
                <X size={18} className="text-[var(--on-surface-variant)]" />
              </button>
            </div>
            <div className="p-6">
              {drawerMode === 'create' ? (
                <form className="space-y-5" onSubmit={createRoom}>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">เลขห้อง</label>
                    <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all" value={createForm.roomNo} placeholder="เช่น 3210" onChange={(e) => setCreateForm((p) => ({ ...p, roomNo: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">ชั้น</label>
                    {floors.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={createForm.floorNo} onChange={(e) => setCreateForm((p) => ({ ...p, floorNo: e.target.value }))}>
                        {floors.map((f) => <option key={f.floorNo} value={f.floorNo}>{f.label}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" type="number" min={1} value={createForm.floorNo} onChange={(e) => setCreateForm((p) => ({ ...p, floorNo: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">ค่าเช่าเริ่มต้น (฿)</label>
                    <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" type="number" min={0} value={createForm.defaultRentAmount} onChange={(e) => setCreateForm((p) => ({ ...p, defaultRentAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">บัญชีธนาคาร</label>
                    {accounts.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={createForm.defaultAccountId} onChange={(e) => setCreateForm((p) => ({ ...p, defaultAccountId: e.target.value }))}>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.bankName})</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={createForm.defaultAccountId} placeholder="ACC_F2" onChange={(e) => setCreateForm((p) => ({ ...p, defaultAccountId: e.target.value }))} required />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">กฎการเรียกเก็บ</label>
                    {rules.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={createForm.defaultRuleCode} onChange={(e) => setCreateForm((p) => ({ ...p, defaultRuleCode: e.target.value }))}>
                        {rules.map((r) => <option key={r.code} value={r.code}>{r.descriptionTh}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={createForm.defaultRuleCode} placeholder="STANDARD" onChange={(e) => setCreateForm((p) => ({ ...p, defaultRuleCode: e.target.value }))} required />
                    )}
                  </div>
                  <button className="w-full py-2.5 bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50" disabled={working === 'create'}>
                    {working === 'create' ? 'กำลังสร้าง...' : 'สร้างห้อง'}
                  </button>
                </form>
              ) : selectedRoom ? (
                <form className="space-y-5" onSubmit={updateRoom}>
                  <div className="px-4 py-3 bg-[var(--surface-container-low)] rounded-lg text-sm text-[var(--on-surface)] border border-[var(--outline-variant)]/10">
                    แก้ไขห้อง <span className="font-bold text-[var(--on-surface)]">{selectedRoom.roomNo}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">ชั้น</label>
                    <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" type="number" min={1} value={editForm.floorNo} onChange={(e) => setEditForm((p) => ({ ...p, floorNo: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">ค่าเช่า (฿)</label>
                    <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" type="number" min={0} value={editForm.defaultRentAmount} onChange={(e) => setEditForm((p) => ({ ...p, defaultRentAmount: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="hasFurniture" checked={editForm.hasFurniture} onChange={(e) => setEditForm((p) => ({ ...p, hasFurniture: e.target.checked }))} className="w-4 h-4 rounded border-[var(--outline-variant)] text-[var(--primary)] focus:ring-[var(--primary)]" />
                    <label htmlFor="hasFurniture" className="text-sm font-medium text-[var(--on-surface)]">มีเฟอร์นิเจอร์</label>
                  </div>
                  {editForm.hasFurniture && (
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">ค่าเฟอร์นิเจอร์ (฿)</label>
                      <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" type="number" min={0} value={editForm.defaultFurnitureAmount} onChange={(e) => setEditForm((p) => ({ ...p, defaultFurnitureAmount: e.target.value }))} />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">บัญชีธนาคาร</label>
                    {accounts.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={editForm.defaultAccountId} onChange={(e) => setEditForm((p) => ({ ...p, defaultAccountId: e.target.value }))}>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.bankName})</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={editForm.defaultAccountId} onChange={(e) => setEditForm((p) => ({ ...p, defaultAccountId: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[var(--on-surface-variant)] mb-2">กฎการเรียกเก็บ</label>
                    {rules.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={editForm.defaultRuleCode} onChange={(e) => setEditForm((p) => ({ ...p, defaultRuleCode: e.target.value }))}>
                        {rules.map((r) => <option key={r.code} value={r.code}>{r.descriptionTh}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[var(--surface-container-low)] border border-[var(--outline-variant)]/30 rounded-lg text-sm focus:ring-2 focus:ring-[var(--primary)]" value={editForm.defaultRuleCode} onChange={(e) => setEditForm((p) => ({ ...p, defaultRuleCode: e.target.value }))} />
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" className="flex-1 py-2.5 bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50" disabled={working === `edit:${selectedRoom.roomNo}`}>
                      {working === `edit:${selectedRoom.roomNo}` ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                    <button type="button" className="px-4 py-2.5 bg-[var(--error-container)]/10 text-[var(--color-danger)] border border-[var(--error-container)]/20 text-sm font-semibold rounded-lg hover:bg-[var(--error-container)]/20 transition-all disabled:opacity-50" onClick={deleteRoom} disabled={working === `delete:${selectedRoom.roomNo}`}>
                      {working === `delete:${selectedRoom.roomNo}` ? 'กำลังลบ...' : 'ลบห้อง'}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDialog?.open ?? false}
        title={confirmDialog?.title ?? ''}
        description={confirmDialog?.description}
        confirmLabel="ยืนยัน"
        cancelLabel="ยกเลิก"
        onConfirm={confirmDialog?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmDialog(null)}
      />
    </main>
  );
}
