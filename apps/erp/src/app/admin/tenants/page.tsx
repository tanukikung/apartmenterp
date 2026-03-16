'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  lineUserId: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  roomTenants?: Array<{
    id: string;
    roomId: string;
    role: 'PRIMARY' | 'SECONDARY';
    moveInDate: string;
    moveOutDate: string | null;
    room?: {
      id: string;
      roomNumber: string;
    };
  }>;
};

type TenantList = {
  data: Tenant[];
  total: number;
};

type Room = {
  id: string;
  roomNumber: string;
  status: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';
};

const createDefaults = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  lineUserId: '',
  emergencyContact: '',
  emergencyPhone: '',
};

export default function AdminTenantsPage() {
  const [data, setData] = useState<TenantList | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(createDefaults);
  const [editForm, setEditForm] = useState(createDefaults);
  const [lineUserId, setLineUserId] = useState('');
  const [assignRoomId, setAssignRoomId] = useState('');
  const [assignRole, setAssignRole] = useState<'PRIMARY' | 'SECONDARY'>('PRIMARY');
  const [assignMoveInDate, setAssignMoveInDate] = useState(new Date().toISOString().slice(0, 10));
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
      });
      const [tenantRes, roomsRes] = await Promise.all([
        fetch(`/api/tenants?${query.toString()}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/rooms?page=1&pageSize=100', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (!tenantRes.success) throw new Error(tenantRes.error?.message || 'Unable to load tenants');
      if (!roomsRes.success) throw new Error(roomsRes.error?.message || 'Unable to load rooms');
      setData(tenantRes.data);
      setRooms(roomsRes.data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tenant data');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTenant = useMemo(
    () => data?.data.find((tenant) => tenant.id === selectedTenantId) || null,
    [data, selectedTenantId]
  );

  useEffect(() => {
    if (selectedTenant) {
      setEditForm({
        firstName: selectedTenant.firstName,
        lastName: selectedTenant.lastName,
        phone: selectedTenant.phone,
        email: selectedTenant.email || '',
        lineUserId: selectedTenant.lineUserId || '',
        emergencyContact: selectedTenant.emergencyContact || '',
        emergencyPhone: selectedTenant.emergencyPhone || '',
      });
      setLineUserId(selectedTenant.lineUserId || '');
    }
  }, [selectedTenant]);

  const availableRooms = useMemo(
    () => rooms.filter((room) => room.status !== 'MAINTENANCE'),
    [rooms]
  );

  async function createTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setWorking('create');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to create tenant');
      setMessage('Tenant created');
      setCreateForm(createDefaults);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create tenant');
    } finally {
      setWorking(null);
    }
  }

  async function updateTenant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedTenant) return;
    setWorking(`edit:${selectedTenant.id}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${selectedTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: editForm.firstName,
          lastName: editForm.lastName,
          phone: editForm.phone,
          email: editForm.email,
          emergencyContact: editForm.emergencyContact,
          emergencyPhone: editForm.emergencyPhone,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to update tenant');
      setMessage('Tenant updated');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update tenant');
    } finally {
      setWorking(null);
    }
  }

  async function linkLine() {
    if (!selectedTenant) return;
    setWorking(`line:${selectedTenant.id}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${selectedTenant.id}/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to link LINE account');
      setMessage('LINE account linked');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to link LINE account');
    } finally {
      setWorking(null);
    }
  }

  async function assignRoom() {
    if (!selectedTenant || !assignRoomId) return;
    setWorking(`assign:${selectedTenant.id}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${assignRoomId}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          role: assignRole,
          moveInDate: assignMoveInDate,
        }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to assign room');
      setMessage('Tenant assigned to room');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign room');
    } finally {
      setWorking(null);
    }
  }

  async function removeFromRoom(roomId: string) {
    if (!selectedTenant) return;
    setWorking(`remove:${selectedTenant.id}:${roomId}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/tenants/${selectedTenant.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moveOutDate: new Date().toISOString().slice(0, 10) }),
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'Unable to remove tenant from room');
      setMessage('Tenant removed from room');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove tenant from room');
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Tenants</h1>
          <p className="admin-page-subtitle">Create and edit tenant profiles, link LINE, and manage room assignments with real backend actions.</p>
        </div>
        <div className="admin-toolbar">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="admin-input w-[260px]" placeholder="Search tenant, phone, room" />
          <Link href="/admin/tenant-registrations" className="admin-button">LINE Registrations</Link>
          <button className="admin-button" onClick={() => void load()}>Refresh</button>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_420px]">
        <section className="admin-card overflow-hidden">
          <div className="admin-card-header">
            <div className="admin-card-title">Tenant Register</div>
            <span className="admin-badge">{data?.total ?? 0} records</span>
          </div>
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Room</th>
                  <th>Phone</th>
                  <th>LINE</th>
                  <th>Move In</th>
                  <th>Contact</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Loading tenant data...</td></tr>
                ) : !data?.data?.length ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No tenants found.</td></tr>
                ) : (
                  data.data.map((tenant) => (
                    <tr key={tenant.id}>
                      <td>
                        <button className="text-left font-medium text-slate-900 underline-offset-4 hover:underline" onClick={() => setSelectedTenantId(tenant.id)}>
                          {tenant.fullName}
                        </button>
                        <div className="text-xs text-slate-500">{tenant.id}</div>
                      </td>
                      <td>{tenant.roomTenants?.[0]?.room?.roomNumber || '-'}</td>
                      <td>{tenant.phone}</td>
                      <td>
                        <span className={`admin-badge ${tenant.lineUserId ? 'admin-status-good' : ''}`}>
                          {tenant.lineUserId ? 'Linked' : 'Not linked'}
                        </span>
                      </td>
                      <td>{tenant.roomTenants?.[0]?.moveInDate ? new Date(tenant.roomTenants[0].moveInDate).toLocaleDateString() : '-'}</td>
                      <td>{tenant.email || '-'}</td>
                      <td>
                        <Link href={`/admin/tenants/${tenant.id}`} className="admin-button text-xs">
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
              <div className="admin-card-title">Create Tenant</div>
            </div>
            <form className="grid gap-4 p-4" onSubmit={createTenant}>
              <input className="admin-input" placeholder="First name" value={createForm.firstName} onChange={(e) => setCreateForm((prev) => ({ ...prev, firstName: e.target.value }))} />
              <input className="admin-input" placeholder="Last name" value={createForm.lastName} onChange={(e) => setCreateForm((prev) => ({ ...prev, lastName: e.target.value }))} />
              <input className="admin-input" placeholder="Phone" value={createForm.phone} onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))} />
              <input className="admin-input" placeholder="Email" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} />
              <input className="admin-input" placeholder="LINE user ID (optional)" value={createForm.lineUserId} onChange={(e) => setCreateForm((prev) => ({ ...prev, lineUserId: e.target.value }))} />
              <input className="admin-input" placeholder="Emergency contact" value={createForm.emergencyContact} onChange={(e) => setCreateForm((prev) => ({ ...prev, emergencyContact: e.target.value }))} />
              <input className="admin-input" placeholder="Emergency phone" value={createForm.emergencyPhone} onChange={(e) => setCreateForm((prev) => ({ ...prev, emergencyPhone: e.target.value }))} />
              <button className="admin-button admin-button-primary" disabled={working === 'create'}>
                {working === 'create' ? 'Creating...' : 'Create Tenant'}
              </button>
            </form>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">Manage Tenant</div>
            </div>
            {selectedTenant ? (
              <div className="grid gap-4 p-4">
                <form className="grid gap-4" onSubmit={updateTenant}>
                  <div className="rounded-3xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-slate-600">
                    Editing <span className="font-semibold text-slate-900">{selectedTenant.fullName}</span>
                  </div>
                  <input className="admin-input" placeholder="First name" value={editForm.firstName} onChange={(e) => setEditForm((prev) => ({ ...prev, firstName: e.target.value }))} />
                  <input className="admin-input" placeholder="Last name" value={editForm.lastName} onChange={(e) => setEditForm((prev) => ({ ...prev, lastName: e.target.value }))} />
                  <input className="admin-input" placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))} />
                  <input className="admin-input" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} />
                  <input className="admin-input" placeholder="Emergency contact" value={editForm.emergencyContact} onChange={(e) => setEditForm((prev) => ({ ...prev, emergencyContact: e.target.value }))} />
                  <input className="admin-input" placeholder="Emergency phone" value={editForm.emergencyPhone} onChange={(e) => setEditForm((prev) => ({ ...prev, emergencyPhone: e.target.value }))} />
                  <button className="admin-button admin-button-primary" disabled={working === `edit:${selectedTenant.id}`}>
                    {working === `edit:${selectedTenant.id}` ? 'Saving...' : 'Save Tenant'}
                  </button>
                </form>

                <div className="grid gap-3 rounded-[1.7rem] border border-border bg-white p-4 shadow-sm">
                  <div className="admin-card-title">LINE Link</div>
                  <input className="admin-input" placeholder="LINE user ID" value={lineUserId} onChange={(e) => setLineUserId(e.target.value)} />
                  <button className="admin-button" onClick={() => void linkLine()} disabled={working === `line:${selectedTenant.id}`}>
                    {working === `line:${selectedTenant.id}` ? 'Linking...' : 'Link LINE'}
                  </button>
                </div>

                <div className="grid gap-3 rounded-[1.7rem] border border-border bg-white p-4 shadow-sm">
                  <div className="admin-card-title">Room Assignment</div>
                  <select className="admin-select" value={assignRoomId} onChange={(e) => setAssignRoomId(e.target.value)}>
                    <option value="">Select room</option>
                    {availableRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.roomNumber} · {room.status}
                      </option>
                    ))}
                  </select>
                  <select className="admin-select" value={assignRole} onChange={(e) => setAssignRole(e.target.value as 'PRIMARY' | 'SECONDARY')}>
                    <option value="PRIMARY">PRIMARY</option>
                    <option value="SECONDARY">SECONDARY</option>
                  </select>
                  <input className="admin-input" type="date" value={assignMoveInDate} onChange={(e) => setAssignMoveInDate(e.target.value)} />
                  <button className="admin-button" onClick={() => void assignRoom()} disabled={working === `assign:${selectedTenant.id}`}>
                    {working === `assign:${selectedTenant.id}` ? 'Assigning...' : 'Assign to Room'}
                  </button>
                  {selectedTenant.roomTenants?.length ? (
                    <div className="space-y-2">
                      {selectedTenant.roomTenants.map((roomTenant) => (
                        <div key={roomTenant.id} className="flex items-center justify-between rounded-3xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-sm">
                          <div>
                            <div className="font-medium text-slate-900">{roomTenant.room?.roomNumber || roomTenant.roomId}</div>
                            <div className="text-slate-500">{roomTenant.role} · Move in {new Date(roomTenant.moveInDate).toLocaleDateString()}</div>
                          </div>
                          <button className="admin-button" onClick={() => void removeFromRoom(roomTenant.roomId)} disabled={working === `remove:${selectedTenant.id}:${roomTenant.roomId}`}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No active room assignment.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-500">Select a tenant from the table to edit profile details, link LINE, or manage room assignment.</div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
