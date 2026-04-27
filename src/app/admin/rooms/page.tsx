'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Plus, X, DoorOpen, Search, ExternalLink } from 'lucide-react';
import { useApiData } from '@/hooks/useApi';
import { useUrlState } from '@/hooks/useUrlState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonKPICard } from '@/components/ui/skeleton';
import { CardGrid } from '@/components/ui/card-grid';

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

// ── Dark glass status helpers ─────────────────────────────────────────────────

function glassRoomStatusBadge(status: Room['roomStatus']) {
  if (status === 'VACANT') return { label: 'ว่าง', cls: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 shadow-[0_0_12px_rgba(34,197,94,0.2)]' };
  if (status === 'OCCUPIED') return { label: 'มีผู้เช่า', cls: 'bg-blue-500/15 text-blue-600 border border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.2)]' };
  if (status === 'MAINTENANCE') return { label: 'ซ่อมบำรุง', cls: 'bg-amber-500/15 text-amber-600 border border-amber-500/20 shadow-[0_0_12px_rgba(251,191,36,0.2)]' };
  if (status === 'OWNER_USE') return { label: 'ใช้เอง', cls: 'bg-violet-500/15 text-violet-600 border border-violet-500/20 shadow-[0_0_12px_rgba(139,92,246,0.2)]' };
  return { label: status, cls: 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]' };
}

function GlassStatusBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls} transition-all duration-200`}>
      {label}
    </span>
  );
}

export default function AdminRoomsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [search, setSearch] = useUrlState<string>('q', '');
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
      ...(search.trim() ? { q: search.trim() } : {}),
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
    vacant: roomsData?.statusCounts?.VACANT ?? 0,
    occupied: roomsData?.statusCounts?.OCCUPIED ?? 0,
    maintenance: roomsData?.statusCounts?.MAINTENANCE ?? 0,
    ownerUse: roomsData?.statusCounts?.OWNER_USE ?? 0,
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
          roomStatus: editForm.roomStatus,
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

  async function _updateStatus(roomNo: string, nextStatus: Room['roomStatus']) {
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
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">

      {/* ── Header ── */}
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--primary))]">ห้องพัก</h1>
          <p className="mt-1 text-sm text-[hsl(var(--on-surface-variant))]">จัดการห้องพัก สร้าง แก้ไข และเปลี่ยนสถานะ</p>
        </div>
        <button
          onClick={() => { setDrawerMode('create'); setSelectedRoom(null); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200"
        >
          <Plus size={14} strokeWidth={2.5} />
          เพิ่มห้อง
        </button>
      </section>

      {/* ── KPI Stats — Dark Glass Cards ── */}
      <section className="grid gap-4 sm:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/60 backdrop-blur shadow-[var(--glass-shadow)] p-5 hover:border-[hsl(var(--color-border))] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-300 group cursor-default">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ทั้งหมด</p>
          <div className="text-2xl font-bold text-[hsl(var(--on-surface))]">{stats.total}</div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/15 bg-[hsl(var(--color-surface))]/60 backdrop-blur shadow-[var(--glass-shadow)] p-5 hover:border-emerald-500/25 hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-300 group cursor-default">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ว่าง</p>
          <div className="text-2xl font-bold text-emerald-600">{stats.vacant}</div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-blue-500/15 bg-[hsl(var(--color-surface))]/60 backdrop-blur shadow-[var(--glass-shadow)] p-5 hover:border-blue-500/25 hover:shadow-[0_0_24px_rgba(59,130,246,0.15)] transition-all duration-300 group cursor-default">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">มีผู้เช่า</p>
          <div className="text-2xl font-bold text-blue-600">{stats.occupied}</div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-amber-500/15 bg-[hsl(var(--color-surface))]/60 backdrop-blur shadow-[var(--glass-shadow)] p-5 hover:border-amber-500/25 hover:shadow-[0_0_24px_rgba(251,191,36,0.15)] transition-all duration-300 group cursor-default">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ซ่อมบำรุง</p>
          <div className="text-2xl font-bold text-amber-600">{stats.maintenance}</div>
        </div>
      </section>

      {/* ── Toolbar ── */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[hsl(var(--color-surface))]/50 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200"
            placeholder="ค้นหาเลขห้อง..."
          />
        </div>
        <select
          className="px-3 py-2 bg-[hsl(var(--color-surface))]/50 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">ทุกสถานะ</option>
          <option value="VACANT">ว่าง</option>
          <option value="OCCUPIED">มีผู้เช่า</option>
          <option value="MAINTENANCE">ซ่อมบำรุง</option>
          <option value="OWNER_USE">ใช้เอง</option>
        </select>
        <div className="flex items-center gap-1 bg-[hsl(var(--color-surface))]/40 border border-[hsl(var(--color-border))] rounded-lg p-1 backdrop-blur">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-all duration-200 ${viewMode === 'grid' ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] shadow-glow-primary' : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))] hover:bg-[hsl(var(--color-surface))]/[0.05]'}`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded transition-all duration-200 ${viewMode === 'table' ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))] shadow-glow-primary' : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))] hover:bg-[hsl(var(--color-surface))]/[0.05]'}`}
          >
            <List size={16} />
          </button>
        </div>
      </section>

      {/* ── Floor Filter Pills ── */}
      {floors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${floorFilter === null ? 'bg-[hsl(var(--primary))] text-white shadow-glow-primary' : 'bg-[hsl(var(--color-surface))]/50 text-[hsl(var(--on-surface-variant))] border border-white/8 hover:border-white/15 hover:bg-[hsl(var(--color-surface))]/[0.05] backdrop-blur'}`}
            onClick={() => setFloorFilter(null)}
          >
            ทุกชั้น
          </button>
          {floors.map(f => (
            <button
              key={f.floorNo}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${floorFilter === f.floorNo ? 'bg-[hsl(var(--primary))] text-white shadow-glow-primary' : 'bg-[hsl(var(--color-surface))]/50 text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))] hover:border-[hsl(var(--color-border))]/80 hover:bg-[hsl(var(--color-surface))]/[0.05] backdrop-blur'}`}
              onClick={() => setFloorFilter(f.floorNo)}
            >
              ชั้น {f.floorNo}
            </button>
          ))}
        </div>
      )}

      {/* ── Alerts ── */}
      {message && (
        <div className="px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 font-medium backdrop-blur">
          {message}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 font-medium backdrop-blur">
          {error}
        </div>
      )}

      {/* ── Room Content ── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonKPICard key={i} index={i} />
          ))}
        </div>
      ) : !filteredRooms.length ? (
        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/40 backdrop-blur shadow-[var(--glass-shadow)]">
          <EmptyState
            icon={<DoorOpen className="h-7 w-7" />}
            title={search.trim() ? `ไม่พบห้องที่ตรงกับ "${search}"` : 'ไม่พบห้อง'}
            description={search.trim() ? 'ลองป้อนคำค้นอื่นหรือล้างการค้นหา' : 'ลองเปลี่ยนตัวกรองหรือเพิ่มห้องใหม่'}
            action={search.trim() ? { label: 'ล้างคำค้นหา', onClick: () => setSearch('') } : undefined}
          />
        </div>
      ) : viewMode === 'grid' ? (
        <CardGrid
          items={filteredRooms}
          columns={4}
          idKey="roomNo"
          getCardMeta={(room) => {
            const badgeCfg = glassRoomStatusBadge(room.roomStatus);
            return {
              title: room.roomNo,
              subtitle: `ชั้น ${room.floorNo}`,
              badge: (
                <GlassStatusBadge label={badgeCfg.label} cls={badgeCfg.cls} />
              ),
              stats: [
                { label: 'ค่าเช่า', value: `฿${Number(room.defaultRentAmount).toLocaleString()}` },
              ],
              footer: (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[hsl(var(--on-surface-variant))]">ค่าเช่าเริ่มต้น</span>
                  <Link
                    href={`/admin/rooms/${encodeURIComponent(room.roomNo)}`}
                    className="text-xs font-semibold text-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]/80 transition-colors flex items-center gap-1 active:scale-[0.98]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ดูรายละเอียด <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ),
            };
          }}
          onCardClick={(room) => setSelectedRoom(room)}
          loading={loading}
          empty={
            <div className="rounded-xl border border-white/8 bg-[hsl(var(--color-surface))]/40 backdrop-blur p-12 text-center">
              <DoorOpen size={40} className="mx-auto text-[hsl(var(--on-surface-variant))] mb-4" />
              <div className="text-sm font-semibold text-[hsl(var(--on-surface-variant))]">ไม่พบห้อง</div>
              <div className="text-xs text-[hsl(var(--on-surface-variant))] mt-1">ลองเปลี่ยนตัวกรองหรือเพิ่มห้องใหม่</div>
            </div>
          }
        />
      ) : (
        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/40 backdrop-blur shadow-[var(--glass-shadow)] overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--color-border))]">
                  <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เลขห้อง</th>
                  <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ชั้น</th>
                  <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                  <th className="px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] text-right">ค่าเช่า</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--color-border))]">
                {filteredRooms.map((room) => {
                  const badgeCfg = glassRoomStatusBadge(room.roomStatus);
                  return (
                    <tr
                      key={room.roomNo}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors duration-150 group"
                      onClick={() => setSelectedRoom(room)}
                    >
                      <td className="px-5 py-4">
                        <span className="font-semibold text-[hsl(var(--on-surface))] font-mono">{room.roomNo}</span>
                      </td>
                      <td className="px-5 py-4 text-[hsl(var(--on-surface-variant))]">ชั้น {room.floorNo}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <GlassStatusBadge label={badgeCfg.label} cls={badgeCfg.cls} />
                          <select
                            className="text-[11px] border border-[hsl(var(--color-border))] rounded px-2 py-1 bg-[hsl(var(--color-surface))]/60 text-[hsl(var(--on-surface))] cursor-pointer focus:outline-none focus:border-[hsl(var(--primary))]/40 focus:ring-1 focus:ring-[hsl(var(--primary))]/20 hover:border-white/20 transition-all duration-200 backdrop-blur"
                            value={room.roomStatus}
                            onChange={(e) => _updateStatus(room.roomNo, e.target.value as Room['roomStatus'])}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="VACANT">ว่าง</option>
                            <option value="OCCUPIED">มีผู้เช่า</option>
                            <option value="MAINTENANCE">ซ่อมบำรุง</option>
                            <option value="OWNER_USE">ใช้เอง</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-semibold text-[hsl(var(--on-surface))]">฿{Number(room.defaultRentAmount).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Drawer — Dark Glass ── */}
      {drawerMode && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={closeDrawer} style={{ animation: 'fade-in 200ms ease' }} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[hsl(var(--color-surface))]/80 backdrop-blur border-l border-[hsl(var(--color-border))] z-50 overflow-y-auto shadow-[-8px_0_32px_rgba(0,0,0,0.12)]" style={{ animation: 'slide-in-right 250ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="sticky top-0 bg-[hsl(var(--color-surface))]/90 backdrop-blur border-b border-[hsl(var(--color-border))] px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-[hsl(var(--primary))]">
                {drawerMode === 'create' ? 'เพิ่มห้องใหม่' : `แก้ไขห้อง ${selectedRoom?.roomNo}`}
              </h2>
              <button onClick={closeDrawer} className="p-2 hover:bg-[hsl(var(--color-surface))]/[0.05] rounded-lg transition-colors duration-200 active:scale-[0.95]">
                <X size={18} className="text-[hsl(var(--on-surface-variant))]" />
              </button>
            </div>
            <div className="p-6">
              {drawerMode === 'create' ? (
                <form className="space-y-5" onSubmit={createRoom}>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">เลขห้อง</label>
                    <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 placeholder:text-[hsl(var(--on-surface-variant))]/40 backdrop-blur transition-all duration-200" value={createForm.roomNo} placeholder="เช่น 3210" onChange={(e) => setCreateForm((p) => ({ ...p, roomNo: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ชั้น</label>
                    {floors.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer" value={createForm.floorNo} onChange={(e) => setCreateForm((p) => ({ ...p, floorNo: e.target.value }))}>
                        {floors.map((f) => <option key={f.floorNo} value={f.floorNo}>{f.label}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" type="number" min={1} value={createForm.floorNo} onChange={(e) => setCreateForm((p) => ({ ...p, floorNo: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ค่าเช่าเริ่มต้น (฿)</label>
                    <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" type="number" min={0} value={createForm.defaultRentAmount} onChange={(e) => setCreateForm((p) => ({ ...p, defaultRentAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">บัญชีธนาคาร</label>
                    {accounts.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer" value={createForm.defaultAccountId} onChange={(e) => setCreateForm((p) => ({ ...p, defaultAccountId: e.target.value }))}>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.bankName})</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={createForm.defaultAccountId} placeholder="ACC_F2" onChange={(e) => setCreateForm((p) => ({ ...p, defaultAccountId: e.target.value }))} required />
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">กฎการเรียกเก็บ</label>
                    {rules.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer" value={createForm.defaultRuleCode} onChange={(e) => setCreateForm((p) => ({ ...p, defaultRuleCode: e.target.value }))}>
                        {rules.map((r) => <option key={r.code} value={r.code}>{r.descriptionTh}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={createForm.defaultRuleCode} placeholder="STANDARD" onChange={(e) => setCreateForm((p) => ({ ...p, defaultRuleCode: e.target.value }))} required />
                    )}
                  </div>
                  <button className="w-full py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50" disabled={working === 'create'}>
                    {working === 'create' ? 'กำลังสร้าง...' : 'สร้างห้อง'}
                  </button>
                </form>
              ) : selectedRoom ? (
                <form className="space-y-5" onSubmit={updateRoom}>
                  <div className="px-4 py-3 bg-[hsl(var(--color-surface))]/[0.05] rounded-lg text-sm text-[hsl(var(--on-surface))] border border-[hsl(var(--color-border))] backdrop-blur">
                    แก้ไขห้อง <span className="font-bold text-[hsl(var(--primary))]">{selectedRoom.roomNo}</span>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ชั้น</label>
                    <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" type="number" min={1} value={editForm.floorNo} onChange={(e) => setEditForm((p) => ({ ...p, floorNo: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ค่าเช่า (฿)</label>
                    <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" type="number" min={0} value={editForm.defaultRentAmount} onChange={(e) => setEditForm((p) => ({ ...p, defaultRentAmount: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="hasFurniture" checked={editForm.hasFurniture} onChange={(e) => setEditForm((p) => ({ ...p, hasFurniture: e.target.checked }))} className="w-4 h-4 rounded border-[hsl(var(--color-border))] text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]/40 cursor-pointer" />
                    <label htmlFor="hasFurniture" className="text-sm font-medium text-[hsl(var(--on-surface))] cursor-pointer">มีเฟอร์นิเจอร์</label>
                  </div>
                  {editForm.hasFurniture && (
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ค่าเฟอร์นิเจอร์ (฿)</label>
                      <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" type="number" min={0} value={editForm.defaultFurnitureAmount} onChange={(e) => setEditForm((p) => ({ ...p, defaultFurnitureAmount: e.target.value }))} />
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">บัญชีธนาคาร</label>
                    {accounts.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer" value={editForm.defaultAccountId} onChange={(e) => setEditForm((p) => ({ ...p, defaultAccountId: e.target.value }))}>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.bankName})</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={editForm.defaultAccountId} onChange={(e) => setEditForm((p) => ({ ...p, defaultAccountId: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">กฎการเรียกเก็บ</label>
                    {rules.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer" value={editForm.defaultRuleCode} onChange={(e) => setEditForm((p) => ({ ...p, defaultRuleCode: e.target.value }))}>
                        {rules.map((r) => <option key={r.code} value={r.code}>{r.descriptionTh}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/60 border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={editForm.defaultRuleCode} onChange={(e) => setEditForm((p) => ({ ...p, defaultRuleCode: e.target.value }))} />
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" className="flex-1 py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50" disabled={working === `edit:${selectedRoom.roomNo}`}>
                      {working === `edit:${selectedRoom.roomNo}` ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                    <button type="button" className="px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-semibold rounded-lg hover:bg-red-500/20 active:scale-[0.98] transition-all duration-200 disabled:opacity-50" onClick={deleteRoom} disabled={working === `delete:${selectedRoom.roomNo}`}>
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
    </div>
  );
}
