'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Plus, X, DoorOpen, Search } from 'lucide-react';
import { useApiData } from '@/hooks/useApi';

type Room = {
  roomNo: string;
  floorNo: number;
  defaultAccountId: string;
  defaultRuleCode: string;
  defaultRentAmount: number;
  hasFurniture: boolean;
  defaultFurnitureAmount: number;
  roomStatus: 'ACTIVE' | 'INACTIVE';
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
  ACTIVE: number;
  INACTIVE: number;
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
  roomStatus: 'ACTIVE' as Room['roomStatus'],
};

type DrawerMode = 'create' | 'edit' | null;

export default function AdminRoomsPage() {
  const [data, setData] = useState<RoomList | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [floorFilter, setFloorFilter] = useState<number | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [createForm, setCreateForm] = useState(createDefaults);
  const [editForm, setEditForm] = useState({ floorNo: 2, defaultRentAmount: '3000', hasFurniture: false, defaultFurnitureAmount: '0', defaultAccountId: '', defaultRuleCode: '', roomStatus: 'ACTIVE' as Room['roomStatus'] });
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);

  // React Query for rooms data
  const roomsQueryParams = useMemo(() => {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '100',
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(statusFilter ? { roomStatus: statusFilter } : {}),
    });
    return `/api/rooms?${params.toString()}`;
  }, [search, statusFilter]);

  const { data: roomsData, isLoading: loading, refetch } = useApiData<RoomList>(roomsQueryParams, ['rooms']);

  const loadMeta = useCallback(async () => {
    const [acctRes, rulesRes, floorsRes] = await Promise.all([
      fetch('/api/bank-accounts', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/billing-rules', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/floors', { cache: 'no-store' }).then((r) => r.json()),
    ]);
    if (acctRes.success) {
      setAccounts(acctRes.data);
      setCreateForm((prev) => ({ ...prev, defaultAccountId: acctRes.data[0]?.id ?? '' }));
    }
    if (rulesRes.success) {
      setRules(rulesRes.data);
      setCreateForm((prev) => ({ ...prev, defaultRuleCode: rulesRes.data[0]?.code ?? '' }));
    }
    if (floorsRes.success) setFloors(floorsRes.data);
  }, []);

  useEffect(() => { void loadMeta(); }, [loadMeta]);

  useEffect(() => {
    if (roomsData) {
      setData(roomsData);
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
    total: data?.total ?? 0,
    active: data?.statusCounts?.ACTIVE ?? 0,
    inactive: data?.statusCounts?.INACTIVE ?? 0,
  }), [data]);

  const filteredRooms = useMemo(() => {
    if (!data?.data) return [];
    if (floorFilter === null) return data.data;
    return data.data.filter(r => r.floorNo === floorFilter);
  }, [data, floorFilter]);

  const uniqueFloors = useMemo(() => {
    const set = new Set(data?.data?.map(r => r.floorNo) ?? []);
    return Array.from(set).sort((a, b) => a - b);
  }, [data]);

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
    if (!confirm(`ลบห้อง ${selectedRoom.roomNo}?\nไม่สามารถย้อนกลับได้`)) return;
    setWorking(`delete:${selectedRoom.roomNo}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(selectedRoom.roomNo)}`, {
        method: 'DELETE',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถลบห้องได้');
      setMessage(`ห้อง ${selectedRoom.roomNo} ลบสำเร็จ`);
      closeDrawer();
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถลบห้องได้');
    } finally {
      setWorking(null);
    }
  }

  async function updateStatus(roomNo: string, nextStatus: Room['roomStatus']) {
    if (nextStatus === 'INACTIVE') {
      if (!confirm(`เปลี่ยนห้อง ${roomNo} เป็น INACTIVE?\nจะไม่สามารถจัดสรรผู้เช่าได้จนกว่าจะเปลี่ยนกลับ`)) return;
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
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">ห้องพัก</h1>
          <p className="mt-1 text-sm text-on-surface-variant">จัดการห้องพัก สร้าง แก้ไข และเปลี่ยนสถานะ</p>
        </div>
        <button
          onClick={() => { setDrawerMode('create'); setSelectedRoom(null); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-primary-container to-primary text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all"
        >
          <Plus size={14} strokeWidth={2.5} />
          เพิ่มห้อง
        </button>
      </section>

      {/* ── KPI Stats ── */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">ทั้งหมด</p>
          <div className="text-2xl font-extrabold tracking-tight text-primary">{stats.total}</div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">ใช้งาน</p>
          <div className="text-2xl font-extrabold tracking-tight text-emerald-600">{stats.active}</div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">ไม่ใช้งาน</p>
          <div className="text-2xl font-extrabold tracking-tight text-on-surface-variant">{stats.inactive}</div>
        </div>
      </section>

      {/* ── Toolbar ── */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-all"
            placeholder="ค้นหาเลขห้อง..."
          />
        </div>
        <select
          className="px-3 py-2 bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">ทุกสถานะ</option>
          <option value="ACTIVE">ใช้งาน</option>
          <option value="INACTIVE">ไม่ใช้งาน</option>
        </select>
        <div className="flex items-center gap-1 bg-surface-container-low rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-all ${viewMode === 'grid' ? 'bg-surface-container-lowest shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded transition-all ${viewMode === 'table' ? 'bg-surface-container-lowest shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
          >
            <List size={16} />
          </button>
        </div>
      </section>

      {/* ── Floor Filter Pills ── */}
      {uniqueFloors.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${floorFilter === null ? 'bg-primary text-white shadow-md' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}
            onClick={() => setFloorFilter(null)}
          >
            ทุกชั้น
          </button>
          {uniqueFloors.map(f => (
            <button
              key={f}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${floorFilter === f ? 'bg-primary text-white shadow-md' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}
              onClick={() => setFloorFilter(f)}
            >
              ชั้น {f}
            </button>
          ))}
        </div>
      )}

      {/* ── Alerts ── */}
      {message && (
        <div className="px-4 py-3 rounded-lg bg-tertiary-container/10 border border-tertiary-container/20 text-sm text-tertiary-container font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-error-container/10 border border-error-container/20 text-sm text-error font-medium">
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
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-12 text-center">
          <DoorOpen size={40} className="mx-auto text-on-surface-variant mb-4" />
          <div className="text-sm font-semibold text-on-surface-variant">ไม่พบห้อง</div>
          <div className="text-xs text-on-surface-variant mt-1">ลองเปลี่ยนตัวกรองหรือเพิ่มห้องใหม่</div>
        </div>
      ) : viewMode === 'grid' ? (
        /* Card Grid View */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredRooms.map((room) => (
            <div
              key={room.roomNo}
              onClick={() => setSelectedRoom(room)}
              className={`bg-surface-container-lowest rounded-xl border overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 ${selectedRoom?.roomNo === room.roomNo ? 'border-primary shadow-lg ring-2 ring-primary/20' : 'border-outline-variant/10 hover:border-primary/20'}`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-2xl font-extrabold tracking-tighter text-primary">{room.roomNo}</h3>
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">ชั้น {room.floorNo}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${room.roomStatus === 'ACTIVE' ? 'bg-tertiary-container/10 text-on-tertiary-container' : 'bg-surface-container text-on-surface-variant'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${room.roomStatus === 'ACTIVE' ? 'bg-on-tertiary-container' : 'bg-on-surface-variant'}`} />
                    {room.roomStatus === 'ACTIVE' ? 'ใช้งาน' : 'ปิด'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-on-surface">฿{Number(room.defaultRentAmount).toLocaleString()}</span>
                  <Link
                    href={`/admin/rooms/${encodeURIComponent(room.roomNo)}`}
                    className="text-xs font-semibold text-primary hover:text-indigo-800 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    ดูรายละเอียด →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เลขห้อง</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ชั้น</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ค่าเช่า</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เปลี่ยนสถานะ</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredRooms.map((room) => (
                <tr key={room.roomNo} className="hover:bg-surface-container-lowest transition-colors">
                  <td className="px-6 py-4">
                    <button className="text-left font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setSelectedRoom(room)}>
                      {room.roomNo}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-on-surface">ชั้น {room.floorNo}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold ${room.roomStatus === 'ACTIVE' ? 'bg-tertiary-container/10 text-on-tertiary-container' : 'bg-surface-container text-on-surface-variant'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${room.roomStatus === 'ACTIVE' ? 'bg-on-tertiary-container' : 'bg-on-surface-variant'}`} />
                      {room.roomStatus === 'ACTIVE' ? 'ใช้งาน' : 'ปิด'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-on-surface">฿{Number(room.defaultRentAmount).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <select
                      className="px-3 py-1.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-xs focus:ring-2 focus:ring-primary"
                      value={room.roomStatus}
                      onChange={(e) => void updateStatus(room.roomNo, e.target.value as Room['roomStatus'])}
                      disabled={working === `status:${room.roomNo}`}
                    >
                      <option value="ACTIVE">ใช้งาน</option>
                      <option value="INACTIVE">ไม่ใช้งาน</option>
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/rooms/${encodeURIComponent(room.roomNo)}`} className="text-xs font-semibold text-primary hover:text-indigo-800">
                      ดู →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Drawer ── */}
      {drawerMode && (
        <>
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40" onClick={closeDrawer} style={{ animation: 'fade-in 200ms ease' }} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface-container-lowest border-l border-outline-variant/10 z-50 overflow-y-auto" style={{ animation: 'slide-in-right 250ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="sticky top-0 bg-surface-container-lowest border-b border-outline-variant/10 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-primary">
                {drawerMode === 'create' ? 'เพิ่มห้องใหม่' : `แก้ไขห้อง ${selectedRoom?.roomNo}`}
              </h2>
              <button onClick={closeDrawer} className="p-2 hover:bg-surface-container-high rounded-lg transition-colors">
                <X size={18} className="text-on-surface-variant" />
              </button>
            </div>
            <div className="p-6">
              {drawerMode === 'create' ? (
                <form className="space-y-5" onSubmit={createRoom}>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">เลขห้อง</label>
                    <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-all" value={createForm.roomNo} placeholder="เช่น 3210" onChange={(e) => setCreateForm((p) => ({ ...p, roomNo: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ชั้น</label>
                    {floors.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.floorNo} onChange={(e) => setCreateForm((p) => ({ ...p, floorNo: e.target.value }))}>
                        {floors.map((f) => <option key={f.floorNo} value={f.floorNo}>{f.label}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" type="number" min={1} value={createForm.floorNo} onChange={(e) => setCreateForm((p) => ({ ...p, floorNo: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ค่าเช่าเริ่มต้น (฿)</label>
                    <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" type="number" min={0} value={createForm.defaultRentAmount} onChange={(e) => setCreateForm((p) => ({ ...p, defaultRentAmount: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">บัญชีธนาคาร</label>
                    {accounts.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.defaultAccountId} onChange={(e) => setCreateForm((p) => ({ ...p, defaultAccountId: e.target.value }))}>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.id} – {a.name} ({a.bankName})</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.defaultAccountId} placeholder="ACC_F2" onChange={(e) => setCreateForm((p) => ({ ...p, defaultAccountId: e.target.value }))} required />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">กฎการเรียกเก็บ</label>
                    {rules.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.defaultRuleCode} onChange={(e) => setCreateForm((p) => ({ ...p, defaultRuleCode: e.target.value }))}>
                        {rules.map((r) => <option key={r.code} value={r.code}>{r.code} – {r.descriptionTh}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.defaultRuleCode} placeholder="STANDARD" onChange={(e) => setCreateForm((p) => ({ ...p, defaultRuleCode: e.target.value }))} required />
                    )}
                  </div>
                  <button className="w-full py-2.5 bg-gradient-to-br from-primary-container to-primary text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50" disabled={working === 'create'}>
                    {working === 'create' ? 'กำลังสร้าง...' : 'สร้างห้อง'}
                  </button>
                </form>
              ) : selectedRoom ? (
                <form className="space-y-5" onSubmit={updateRoom}>
                  <div className="px-4 py-3 bg-surface-container-low rounded-lg text-sm text-on-surface border border-outline-variant/10">
                    แก้ไขห้อง <span className="font-bold text-on-surface">{selectedRoom.roomNo}</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ชั้น</label>
                    <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" type="number" min={1} value={editForm.floorNo} onChange={(e) => setEditForm((p) => ({ ...p, floorNo: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ค่าเช่า (฿)</label>
                    <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" type="number" min={0} value={editForm.defaultRentAmount} onChange={(e) => setEditForm((p) => ({ ...p, defaultRentAmount: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="hasFurniture" checked={editForm.hasFurniture} onChange={(e) => setEditForm((p) => ({ ...p, hasFurniture: e.target.checked }))} className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary" />
                    <label htmlFor="hasFurniture" className="text-sm font-medium text-on-surface">มีเฟอร์นิเจอร์</label>
                  </div>
                  {editForm.hasFurniture && (
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ค่าเฟอร์นิเจอร์ (฿)</label>
                      <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" type="number" min={0} value={editForm.defaultFurnitureAmount} onChange={(e) => setEditForm((p) => ({ ...p, defaultFurnitureAmount: e.target.value }))} />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">บัญชีธนาคาร</label>
                    {accounts.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.defaultAccountId} onChange={(e) => setEditForm((p) => ({ ...p, defaultAccountId: e.target.value }))}>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.id} – {a.name}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.defaultAccountId} onChange={(e) => setEditForm((p) => ({ ...p, defaultAccountId: e.target.value }))} />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">กฎการเรียกเก็บ</label>
                    {rules.length > 0 ? (
                      <select className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.defaultRuleCode} onChange={(e) => setEditForm((p) => ({ ...p, defaultRuleCode: e.target.value }))}>
                        {rules.map((r) => <option key={r.code} value={r.code}>{r.code} – {r.descriptionTh}</option>)}
                      </select>
                    ) : (
                      <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.defaultRuleCode} onChange={(e) => setEditForm((p) => ({ ...p, defaultRuleCode: e.target.value }))} />
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" className="flex-1 py-2.5 bg-gradient-to-br from-primary-container to-primary text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50" disabled={working === `edit:${selectedRoom.roomNo}`}>
                      {working === `edit:${selectedRoom.roomNo}` ? 'กำลังบันทึก...' : 'บันทึก'}
                    </button>
                    <button type="button" className="px-4 py-2.5 bg-error-container/10 text-error border border-error-container/20 text-sm font-semibold rounded-lg hover:bg-error-container/20 transition-all disabled:opacity-50" onClick={deleteRoom} disabled={working === `delete:${selectedRoom.roomNo}`}>
                      {working === `delete:${selectedRoom.roomNo}` ? 'กำลังลบ...' : 'ลบห้อง'}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
