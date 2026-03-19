'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Room = {
  id: string;
  floorId: string;
  roomNumber: string;
  status: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';
  capacity: number;
  createdAt: string;
  updatedAt: string;
  floor?: {
    id: string;
    floorNumber: number;
    buildingId: string;
  };
};

type Floor = {
  id: string;
  floorNumber: number;
  buildingId: string;
  buildingName: string;
};

type RoomStatusCounts = {
  OCCUPIED: number;
  VACANT: number;
  MAINTENANCE: number;
};

type RoomList = {
  data: Room[];
  total: number;
  statusCounts?: RoomStatusCounts;
};

const createDefaults = {
  floorId: '',
  roomNumber: '',
  capacity: '2',
  status: 'VACANT' as Room['status'],
};

function statusTone(status: Room['status']): string {
  if (status === 'OCCUPIED') return 'admin-status-good';
  if (status === 'MAINTENANCE') return 'admin-status-warn';
  return '';
}

export default function AdminRoomsPage() {
  const [data, setData] = useState<RoomList | null>(null);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(createDefaults);
  const [editForm, setEditForm] = useState({ roomNumber: '', capacity: '2' });
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: '1',
        pageSize: '100',
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(status ? { status } : {}),
      });
      const [roomsRes, floorsRes] = await Promise.all([
        fetch(`/api/rooms?${query.toString()}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/floors', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (!roomsRes.success) throw new Error(roomsRes.error?.message || 'Unable to load rooms');
      if (!floorsRes.success) throw new Error(floorsRes.error?.message || 'Unable to load floors');
      setData(roomsRes.data);
      setFloors(floorsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load rooms');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRoom = useMemo(
    () => data?.data.find((room) => room.id === selectedRoomId) || null,
    [data, selectedRoomId]
  );

  useEffect(() => {
    if (selectedRoom) {
      setEditForm({
        roomNumber: selectedRoom.roomNumber,
        capacity: String(selectedRoom.capacity),
      });
    }
  }, [selectedRoom]);

  const stats = useMemo(() => {
    // Use the API-provided counts rather than deriving from the current page of
    // results. data.total is the filtered count; statusCounts are the global
    // (unfiltered) per-status totals returned by the service.
    return {
      total: data?.total ?? 0,
      occupied: data?.statusCounts?.OCCUPIED ?? 0,
      vacant: data?.statusCounts?.VACANT ?? 0,
      maintenance: data?.statusCounts?.MAINTENANCE ?? 0,
    };
  }, [data]);

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
          floorId: createForm.floorId,
          roomNumber: createForm.roomNumber,
          capacity: Number(createForm.capacity),
          status: createForm.status,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to create room');
      setMessage('Room created');
      setCreateForm(createDefaults);
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
    setWorking(`edit:${selectedRoom.id}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${selectedRoom.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber: editForm.roomNumber,
          capacity: Number(editForm.capacity),
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to update room');
      setMessage('Room updated');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update room');
    } finally {
      setWorking(null);
    }
  }

  async function deleteRoom() {
    if (!selectedRoom) return;
    setWorking(`delete:${selectedRoom.id}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${selectedRoom.id}`, {
        method: 'DELETE',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to delete room');
      setMessage('Room deleted');
      setSelectedRoomId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete room');
    } finally {
      setWorking(null);
    }
  }

  async function updateStatus(roomId: string, nextStatus: Room['status'], roomNumber: string) {
    if (nextStatus === 'MAINTENANCE') {
      if (!confirm(`Mark room ${roomNumber} as MAINTENANCE?\nThis will block new tenant assignments until status changes.`)) return;
    }
    setWorking(`status:${roomId}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to update room status');
      setMessage('Room status updated');
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
          <p className="admin-page-subtitle">Create, edit, delete, search, and update room status against the real backend.</p>
        </div>
        <div className="admin-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="admin-input w-[240px]" placeholder="Search room number" />
          <select className="admin-select w-[180px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="VACANT">Vacant</option>
            <option value="OCCUPIED">Occupied</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
          <button onClick={() => void load()} className="admin-button">Refresh</button>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="admin-kpi"><div className="admin-kpi-label">Total Rooms</div><div className="admin-kpi-value">{stats.total}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Occupied</div><div className="admin-kpi-value">{stats.occupied}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Vacant</div><div className="admin-kpi-value">{stats.vacant}</div></div>
        <div className="admin-kpi"><div className="admin-kpi-label">Maintenance</div><div className="admin-kpi-value">{stats.maintenance}</div></div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_420px]">
        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title">Room Register</div>
            <span className="admin-badge">{data?.total ?? 0} records</span>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Floor</th>
                  <th>Status</th>
                  <th>Capacity</th>
                  <th>Updated</th>
                  <th>Actions</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Loading room data...</td></tr>
                ) : !data?.data?.length ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No rooms found.</td></tr>
                ) : (
                  data.data.map((room) => (
                    <tr key={room.id}>
                      <td>
                        <button className="text-left font-medium text-slate-900 underline-offset-4 hover:underline" onClick={() => setSelectedRoomId(room.id)}>
                          {room.roomNumber}
                        </button>
                      </td>
                      <td>{room.floor?.floorNumber ?? '-'}</td>
                      <td><span className={`admin-badge ${statusTone(room.status)}`}>{room.status}</span></td>
                      <td>{room.capacity}</td>
                      <td>{new Date(room.updatedAt).toLocaleString()}</td>
                      <td>
                        <select
                          className="admin-select min-w-[150px]"
                          value={room.status}
                          onChange={(e) => void updateStatus(room.id, e.target.value as Room['status'], room.roomNumber)}
                          disabled={working === `status:${room.id}`}
                        >
                          <option value="VACANT">VACANT</option>
                          <option value="OCCUPIED">OCCUPIED</option>
                          <option value="MAINTENANCE">MAINTENANCE</option>
                        </select>
                      </td>
                      <td>
                        <Link href={`/admin/rooms/${room.id}`} className="admin-button text-xs">
                          View →
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
          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Create Room</div>
            </div>
            <form className="grid gap-4 p-4" onSubmit={createRoom}>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Floor</label>
                <select className="admin-select" value={createForm.floorId} onChange={(e) => setCreateForm((prev) => ({ ...prev, floorId: e.target.value }))}>
                  <option value="">Select floor</option>
                  {floors.map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {floor.buildingName} · Floor {floor.floorNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Room Number</label>
                <input className="admin-input" value={createForm.roomNumber} onChange={(e) => setCreateForm((prev) => ({ ...prev, roomNumber: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Capacity</label>
                <input className="admin-input" type="number" min={1} max={10} value={createForm.capacity} onChange={(e) => setCreateForm((prev) => ({ ...prev, capacity: e.target.value }))} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Initial Status</label>
                <select className="admin-select" value={createForm.status} onChange={(e) => setCreateForm((prev) => ({ ...prev, status: e.target.value as Room['status'] }))}>
                  <option value="VACANT">VACANT</option>
                  <option value="OCCUPIED">OCCUPIED</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                </select>
              </div>
              <button className="admin-button admin-button-primary" disabled={working === 'create'}>
                {working === 'create' ? 'Creating...' : 'Create Room'}
              </button>
            </form>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Edit Room</div>
            </div>
            {selectedRoom ? (
              <form className="grid gap-4 p-4" onSubmit={updateRoom}>
                <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-slate-600">
                  Editing room <span className="font-semibold text-slate-900">{selectedRoom.roomNumber}</span> on floor {selectedRoom.floor?.floorNumber ?? '-'}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Room Number</label>
                  <input className="admin-input" value={editForm.roomNumber} onChange={(e) => setEditForm((prev) => ({ ...prev, roomNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Capacity</label>
                  <input className="admin-input" type="number" min={1} max={10} value={editForm.capacity} onChange={(e) => setEditForm((prev) => ({ ...prev, capacity: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button className="admin-button admin-button-primary" disabled={working === `edit:${selectedRoom.id}`}>
                    {working === `edit:${selectedRoom.id}` ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button type="button" className="admin-button" onClick={deleteRoom} disabled={working === `delete:${selectedRoom.id}`}>
                    {working === `delete:${selectedRoom.id}` ? 'Deleting...' : 'Delete Room'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 text-sm text-slate-500">Select a room from the table to edit or delete it.</div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
