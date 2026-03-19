'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

function statusTone(status: Room['roomStatus']): string {
  if (status === 'ACTIVE') return 'admin-status-good';
  return 'admin-status-warn';
}

export default function AdminRoomsPage() {
  const [data, setData] = useState<RoomList | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [rules, setRules] = useState<BillingRule[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [createForm, setCreateForm] = useState(createDefaults);
  const [editForm, setEditForm] = useState({ defaultRentAmount: '3000', hasFurniture: false, defaultFurnitureAmount: '0', defaultAccountId: '', defaultRuleCode: '', roomStatus: 'ACTIVE' as Room['roomStatus'] });
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: '1',
        pageSize: '100',
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(statusFilter ? { roomStatus: statusFilter } : {}),
      });
      const res = await fetch(`/api/rooms?${query.toString()}`, { cache: 'no-store' }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to load rooms');
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load rooms');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedRoom) {
      setEditForm({
        defaultRentAmount: String(selectedRoom.defaultRentAmount),
        hasFurniture: selectedRoom.hasFurniture,
        defaultFurnitureAmount: String(selectedRoom.defaultFurnitureAmount),
        defaultAccountId: selectedRoom.defaultAccountId,
        defaultRuleCode: selectedRoom.defaultRuleCode,
        roomStatus: selectedRoom.roomStatus,
      });
    }
  }, [selectedRoom]);

  const stats = useMemo(() => ({
    total: data?.total ?? 0,
    active: data?.statusCounts?.ACTIVE ?? 0,
    inactive: data?.statusCounts?.INACTIVE ?? 0,
  }), [data]);

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
      if (!res.success) throw new Error(res.error?.message || 'Unable to create room');
      setMessage(`ห้อง ${createForm.roomNo} สร้างสำเร็จ`);
      setCreateForm((prev) => ({ ...prev, roomNo: '' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create room');
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
          defaultRentAmount: Number(editForm.defaultRentAmount),
          hasFurniture: editForm.hasFurniture,
          defaultFurnitureAmount: Number(editForm.defaultFurnitureAmount),
          defaultAccountId: editForm.defaultAccountId,
          defaultRuleCode: editForm.defaultRuleCode,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to update room');
      setMessage(`ห้อง ${selectedRoom.roomNo} อัพเดทสำเร็จ`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update room');
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
      if (!res.success) throw new Error(res.error?.message || 'Unable to delete room');
      setMessage(`ห้อง ${selectedRoom.roomNo} ลบสำเร็จ`);
      setSelectedRoom(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete room');
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
      if (!res.success) throw new Error(res.error?.message || 'Unable to update room status');
      setMessage(`สถานะห้อง ${roomNo} อัพเดทสำเร็จ`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update room status');
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Rooms</h1>
          <p className="admin-page-subtitle">จัดการห้องพัก สร้าง แก้ไข ลบ และเปลี่ยนสถานะ</p>
        </div>
        <div className="admin-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="admin-input w-[200px]" placeholder="ค้นหาเลขห้อง" />
          <select className="admin-select w-[160px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">ทุกสถานะ</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button onClick={() => void load()} className="admin-button">Refresh</button>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="admin-kpi"><div className="admin-kpi-label">ทั้งหมด</div><div className="admin-kpi-value">{stats.total}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Active</div><div className="admin-kpi-value">{stats.active}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Inactive</div><div className="admin-kpi-value">{stats.inactive}</div></div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_420px]">
        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title">ทะเบียนห้องพัก</div>
            <span className="admin-badge">{data?.total ?? 0} ห้อง</span>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>เลขห้อง</th>
                  <th>ชั้น</th>
                  <th>สถานะ</th>
                  <th>ค่าเช่า</th>
                  <th>บัญชี</th>
                  <th>เปลี่ยนสถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">กำลังโหลด...</td></tr>
                ) : !data?.data?.length ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">ไม่พบห้อง</td></tr>
                ) : (
                  data.data.map((room) => (
                    <tr key={room.roomNo}>
                      <td>
                        <button className="text-left font-medium text-slate-900 underline-offset-4 hover:underline" onClick={() => setSelectedRoom(room)}>
                          {room.roomNo}
                        </button>
                      </td>
                      <td>ชั้น {room.floorNo}</td>
                      <td><span className={`admin-badge ${statusTone(room.roomStatus)}`}>{room.roomStatus}</span></td>
                      <td>฿{Number(room.defaultRentAmount).toLocaleString()}</td>
                      <td className="text-xs text-slate-500">{room.defaultAccountId}</td>
                      <td>
                        <select
                          className="admin-select min-w-[130px]"
                          value={room.roomStatus}
                          onChange={(e) => void updateStatus(room.roomNo, e.target.value as Room['roomStatus'])}
                          disabled={working === `status:${room.roomNo}`}
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="INACTIVE">INACTIVE</option>
                        </select>
                      </td>
                      <td>
                        <Link href={`/admin/rooms/${encodeURIComponent(room.roomNo)}`} className="admin-button text-xs">
                          ดู →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          {/* Create Room */}
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">เพิ่มห้องใหม่</div>
            </div>
            <form className="grid gap-4 p-4" onSubmit={createRoom}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">เลขห้อง</label>
                <input className="admin-input" value={createForm.roomNo} placeholder="เช่น 3210" onChange={(e) => setCreateForm((p) => ({ ...p, roomNo: e.target.value }))} required />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">ชั้น</label>
                {floors.length > 0 ? (
                  <select className="admin-select" value={createForm.floorNo} onChange={(e) => setCreateForm((p) => ({ ...p, floorNo: e.target.value }))}>
                    {floors.map((f) => <option key={f.floorNo} value={f.floorNo}>{f.label}</option>)}
                  </select>
                ) : (
                  <input className="admin-input" type="number" min={1} value={createForm.floorNo} onChange={(e) => setCreateForm((p) => ({ ...p, floorNo: e.target.value }))} />
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">ค่าเช่าเริ่มต้น (฿)</label>
                <input className="admin-input" type="number" min={0} value={createForm.defaultRentAmount} onChange={(e) => setCreateForm((p) => ({ ...p, defaultRentAmount: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">บัญชีธนาคาร</label>
                {accounts.length > 0 ? (
                  <select className="admin-select" value={createForm.defaultAccountId} onChange={(e) => setCreateForm((p) => ({ ...p, defaultAccountId: e.target.value }))}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.id} – {a.name} ({a.bankName})</option>)}
                  </select>
                ) : (
                  <input className="admin-input" value={createForm.defaultAccountId} placeholder="ACC_F2" onChange={(e) => setCreateForm((p) => ({ ...p, defaultAccountId: e.target.value }))} required />
                )}
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">กฎการเรียกเก็บ</label>
                {rules.length > 0 ? (
                  <select className="admin-select" value={createForm.defaultRuleCode} onChange={(e) => setCreateForm((p) => ({ ...p, defaultRuleCode: e.target.value }))}>
                    {rules.map((r) => <option key={r.code} value={r.code}>{r.code} – {r.descriptionTh}</option>)}
                  </select>
                ) : (
                  <input className="admin-input" value={createForm.defaultRuleCode} placeholder="STANDARD" onChange={(e) => setCreateForm((p) => ({ ...p, defaultRuleCode: e.target.value }))} required />
                )}
              </div>
              <button className="admin-button admin-button-primary" disabled={working === 'create'}>
                {working === 'create' ? 'กำลังสร้าง...' : 'สร้างห้อง'}
              </button>
            </form>
          </section>

          {/* Edit Room */}
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">แก้ไขห้อง</div>
            </div>
            {selectedRoom ? (
              <form className="grid gap-4 p-4" onSubmit={updateRoom}>
                <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-slate-600">
                  แก้ไขห้อง <span className="font-semibold text-slate-900">{selectedRoom.roomNo}</span> ชั้น {selectedRoom.floorNo}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">ค่าเช่า (฿)</label>
                  <input className="admin-input" type="number" min={0} value={editForm.defaultRentAmount} onChange={(e) => setEditForm((p) => ({ ...p, defaultRentAmount: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="hasFurniture" checked={editForm.hasFurniture} onChange={(e) => setEditForm((p) => ({ ...p, hasFurniture: e.target.checked }))} />
                  <label htmlFor="hasFurniture" className="text-sm font-medium text-slate-700">มีเฟอร์นิเจอร์</label>
                </div>
                {editForm.hasFurniture && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">ค่าเฟอร์นิเจอร์ (฿)</label>
                    <input className="admin-input" type="number" min={0} value={editForm.defaultFurnitureAmount} onChange={(e) => setEditForm((p) => ({ ...p, defaultFurnitureAmount: e.target.value }))} />
                  </div>
                )}
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">บัญชีธนาคาร</label>
                  {accounts.length > 0 ? (
                    <select className="admin-select" value={editForm.defaultAccountId} onChange={(e) => setEditForm((p) => ({ ...p, defaultAccountId: e.target.value }))}>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.id} – {a.name}</option>)}
                    </select>
                  ) : (
                    <input className="admin-input" value={editForm.defaultAccountId} onChange={(e) => setEditForm((p) => ({ ...p, defaultAccountId: e.target.value }))} />
                  )}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">กฎการเรียกเก็บ</label>
                  {rules.length > 0 ? (
                    <select className="admin-select" value={editForm.defaultRuleCode} onChange={(e) => setEditForm((p) => ({ ...p, defaultRuleCode: e.target.value }))}>
                      {rules.map((r) => <option key={r.code} value={r.code}>{r.code} – {r.descriptionTh}</option>)}
                    </select>
                  ) : (
                    <input className="admin-input" value={editForm.defaultRuleCode} onChange={(e) => setEditForm((p) => ({ ...p, defaultRuleCode: e.target.value }))} />
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="admin-button admin-button-primary" disabled={working === `edit:${selectedRoom.roomNo}`}>
                    {working === `edit:${selectedRoom.roomNo}` ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                  <button type="button" className="admin-button" onClick={deleteRoom} disabled={working === `delete:${selectedRoom.roomNo}`}>
                    {working === `delete:${selectedRoom.roomNo}` ? 'กำลังลบ...' : 'ลบห้อง'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 text-sm text-slate-500">คลิกที่ห้องในตารางเพื่อแก้ไขหรือลบ</div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
