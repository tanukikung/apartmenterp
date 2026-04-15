'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus, Home, Search, Inbox, CheckCircle, MessageCircle, XCircle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tenant = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  lineUserId: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  roomTenants: Array<{
    id: string;
    roomNo: string;
    tenantId: string;
    role: string;
    moveInDate: string;
    moveOutDate: string | null;
  }>;
};

type Room = {
  roomNo: string;
  roomStatus: string;
};

type Tab = 'edit' | 'line' | 'rooms';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-blue-100 text-blue-700'];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.charAt(0) ?? '').toUpperCase();
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('edit');
  const [showCreate, setShowCreate] = useState(false);

  // Forms
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', phone: '', emergencyContact: '', emergencyPhone: '' });
  const [createForm, setCreateForm] = useState({ firstName: '', lastName: '', email: '', phone: '', emergencyContact: '', emergencyPhone: '' });
  const [lineUserId, setLineUserId] = useState('');
  const [lineIdError, setLineIdError] = useState<string | null>(null);
  const [assignRoom, setAssignRoom] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description?: string; onConfirm: () => void } | null>(null);

  // ─── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch ALL tenants by paginating through the list endpoint (max pageSize=100).
      const PAGE_SIZE = 100;
      const allTenants: Tenant[] = [];
      let page = 1;
      while (true) {
        const res = await fetch(`/api/tenants?page=${page}&pageSize=${PAGE_SIZE}`, { cache: 'no-store' }).then(r => r.json());
        if (!res.success) break;
        const chunk: Tenant[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        allTenants.push(...chunk);
        const total: number = (res.data?.total as number | undefined) ?? chunk.length;
        if (allTenants.length >= total || chunk.length === 0) break;
        page += 1;
        if (page > 100) break; // safety stop (>10k tenants)
      }

      // Rooms: fetch all pages too (max pageSize=300 per request)
      const allRooms: Room[] = [];
      let rp = 1;
      while (true) {
        const res = await fetch(`/api/rooms?page=${rp}&pageSize=300`, { cache: 'no-store' }).then(r => r.json());
        if (!res.success) break;
        const chunk: Room[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        allRooms.push(...chunk);
        const total: number = (res.data?.total as number | undefined) ?? chunk.length;
        if (allRooms.length >= total || chunk.length === 0) break;
        rp += 1;
        if (rp > 50) break;
      }

      setTenants(allTenants);
      setRooms(allRooms);
    } catch {
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tenants;
    const q = search.toLowerCase();
    return tenants.filter(t =>
      (t.fullName?.toLowerCase() ?? '').includes(q) ||
      (t.phone ?? '').includes(q) ||
      (t.email?.toLowerCase() ?? '').includes(q) ||
      t.roomTenants?.some(rt => rt.roomNo.includes(q))
    );
  }, [tenants, search]);

  // ─── Open drawer ──────────────────────────────────────────────────────────

  function openTenantDrawer(t: Tenant) {
    setSelectedTenant(t);
    setEditForm({
      firstName: t.firstName ?? '',
      lastName: t.lastName ?? '',
      email: t.email ?? '',
      phone: t.phone ?? '',
      emergencyContact: t.emergencyContact ?? '',
      emergencyPhone: t.emergencyPhone ?? '',
    });
    setLineUserId(t.lineUserId ?? '');
    setLineIdError(null);
    setAssignRoom('');
    setActiveTab('edit');
    setDrawerOpen(true);
    setShowCreate(false);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedTenant(null);
    setShowCreate(false);
  }

  // ─── CRUD actions ──────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setWorking('create'); setMessage(null); setError(null);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createForm, emergencyPhone: createForm.emergencyPhone || undefined }),
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถเพิ่มผู้เช่าได้');
      setMessage('เพิ่มผู้เช่าสำเร็จ');
      setCreateForm({ firstName: '', lastName: '', email: '', phone: '', emergencyContact: '', emergencyPhone: '' });
      closeDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setWorking(null);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTenant) return;
    setWorking(`edit:${selectedTenant.id}`); setMessage(null); setError(null);
    try {
      const res = await fetch(`/api/tenants/${selectedTenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, emergencyPhone: editForm.emergencyPhone || undefined }),
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถอัพเดทได้');
      setMessage('อัพเดทผู้เช่าสำเร็จ');
      closeDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setWorking(null);
    }
  }

  async function handleLinkLine(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTenant) return;
    if (lineUserId && !/^U[A-Za-z0-9]+$/.test(lineUserId)) {
      setLineIdError('LINE UID ต้องขึ้นต้นด้วย U ตามด้วยตัวอักษรหรือตัวเลข (เช่น Udf3k...)');
      return;
    }
    setWorking(`line:${selectedTenant.id}`); setMessage(null); setError(null);
    try {
      const res = await fetch(`/api/tenants/${selectedTenant.id}/line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId: lineUserId || null }),
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถลิงก์ LINE ได้');
      setMessage('ลิงก์ LINE สำเร็จ');
      closeDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setWorking(null);
    }
  }

  async function handleAssignRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTenant || !assignRoom) return;
    setWorking(`assign:${selectedTenant.id}`); setMessage(null); setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(assignRoom)}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant.id,
          role: 'PRIMARY',
          moveInDate: new Date().toISOString().split('T')[0],
        }),
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถจัดสรรห้องได้');
      setMessage(`จัดสรรห้อง ${assignRoom} สำเร็จ`);
      setAssignRoom('');
      closeDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setWorking(null);
    }
  }

  async function handleRemoveRoom(roomNo: string) {
    if (!selectedTenant) return;
    const tenantId = selectedTenant.id;
    setConfirmDialog({
      open: true,
      title: `ถอนห้อง ${roomNo} จากผู้เช่า?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setWorking(`remove:${tenantId}:${roomNo}`); setMessage(null); setError(null);
        try {
          const res = await fetch(`/api/rooms/${encodeURIComponent(roomNo)}/tenants/${tenantId}`, {
            method: 'DELETE',
          }).then(r => r.json());
          if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถถอนห้องได้');
          setMessage(`ถอนห้อง ${roomNo} สำเร็จ`);
          closeDrawer();
          await load();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
        } finally {
          setWorking(null);
        }
      },
    });
  }

  return (
    <main className="p-8 max-w-7xl mx-auto w-full space-y-6">

      {/* Header */}
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-primary">ผู้เช่า</h1>
          <p className="mt-1 text-sm text-on-surface-variant">จัดการผู้เช่า เชื่อมต่อ LINE และจัดสรรห้อง</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 pr-4 py-2 bg-surface-container-lowest border border-outline-variant/30 rounded-lg text-sm w-[220px] focus:ring-2 focus:ring-primary" placeholder="ค้นหาชื่อ ห้อง เบอร์โทร..." />
          </div>
          <button onClick={() => { setShowCreate(true); setDrawerOpen(true); setSelectedTenant(null); }} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary-container to-primary text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all">
            <Plus size={14} strokeWidth={2.5} />
            เพิ่มผู้เช่า
          </button>
        </div>
      </section>

      {/* Alerts */}
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

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">ผู้เช่าทั้งหมด</p>
          <div className="text-2xl font-extrabold tracking-tight text-primary">{tenants.length}</div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">เชื่อม LINE</p>
          <div className="text-2xl font-extrabold tracking-tight text-emerald-600">{tenants.filter(t=>t.lineUserId).length}</div>
        </div>
        <div className="bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10 hover:shadow-lg transition-all">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">มีห้อง</p>
          <div className="text-2xl font-extrabold tracking-tight text-amber-600">{tenants.filter(t=>t.roomTenants?.length>0).length}</div>
        </div>
      </section>

      {/* Tenant List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-16 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-12 text-center">
          <Inbox size={40} className="mx-auto text-on-surface-variant mb-4" />
          <div className="text-sm font-semibold text-on-surface-variant">ไม่พบผู้เช่า</div>
          <div className="text-xs text-on-surface-variant mt-1">{search.trim() ? 'ลองป้อนคำค้นอื่น' : 'เพิ่มผู้เช่าใหม่เพื่อเริ่มต้น'}</div>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-low/50">
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ผู้เช่า</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เบอร์โทร</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">อีเมล</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">LINE</th>
                  <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filtered.map((t) => {
                  const name = t.fullName || 'ไม่ระบุชื่อ';
                  return (
                    <tr key={t.id} className="hover:bg-surface-container-lowest transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(name)}`}>
                            {initials(name)}
                          </div>
                          <span className="text-sm font-semibold text-on-surface">{name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-on-surface">{t.phone || '—'}</td>
                      <td className="px-6 py-4 text-sm text-on-surface">{t.email || '—'}</td>
                      <td className="px-6 py-4">
                        {t.roomTenants?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.roomTenants.map(rt => (
                              <span key={rt.id} className="inline-flex items-center px-2 py-0.5 bg-primary-container/10 text-primary-container text-[10px] font-bold rounded-full">{rt.roomNo}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-on-surface-variant">ไม่มี</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {t.lineUserId ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                            <CheckCircle size={12} />
                            เชื่อมแล้ว
                          </span>
                        ) : (
                          <span className="text-xs text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openTenantDrawer(t)}
                          className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          จัดการ
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40" onClick={closeDrawer} style={{ animation: 'fade-in 200ms ease' }} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-surface-container-lowest border-l border-outline-variant/10 z-50 overflow-y-auto" style={{ animation: 'slide-in-right 250ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="sticky top-0 bg-surface-container-lowest border-b border-outline-variant/10 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-primary">
                {showCreate ? 'เพิ่มผู้เช่าใหม่' : `จัดการ ${selectedTenant ? `${selectedTenant.firstName} ${selectedTenant.lastName}` : ''}`}
              </h2>
              <button onClick={closeDrawer} className="p-2 hover:bg-surface-container-high rounded-lg transition-colors">
                <X size={18} className="text-on-surface-variant" />
              </button>
            </div>

            {showCreate ? (
              <div className="p-6">
                <form className="space-y-5" onSubmit={handleCreate}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ชื่อ</label>
                      <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.firstName} placeholder="ชื่อ" onChange={e => setCreateForm(p => ({ ...p, firstName: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">นามสกุล</label>
                      <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.lastName} placeholder="นามสกุล" onChange={e => setCreateForm(p => ({ ...p, lastName: e.target.value }))} required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">เบอร์โทร</label>
                    <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.phone} placeholder="0xx-xxx-xxxx" onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">อีเมล</label>
                    <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" type="email" value={createForm.email} placeholder="email@example.com" onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ผู้ติดต่อฉุกเฉิน</label>
                    <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.emergencyContact} placeholder="ชื่อ + เบอร์โทร" onChange={e => setCreateForm(p => ({ ...p, emergencyContact: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">โทรศัพท์ฉุกเฉิน</label>
                    <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={createForm.emergencyPhone} placeholder="0xx-xxx-xxxx" onChange={e => setCreateForm(p => ({ ...p, emergencyPhone: e.target.value }))} />
                  </div>
                  <button className="w-full py-2.5 bg-gradient-to-br from-primary-container to-primary text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50" disabled={working === 'create'}>
                    {working === 'create' ? 'กำลังเพิ่ม...' : 'เพิ่มผู้เช่า'}
                  </button>
                </form>
              </div>
            ) : selectedTenant ? (
              <>
                {/* Tab Nav */}
                <div className="flex border-b border-outline-variant/10">
                  <button className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'edit' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`} onClick={() => setActiveTab('edit')}>แก้ไขข้อมูล</button>
                  <button className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'line' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`} onClick={() => setActiveTab('line')}>LINE</button>
                  <button className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'rooms' ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`} onClick={() => setActiveTab('rooms')}>ห้องพัก</button>
                </div>
                <div className="p-6">

                  {/* Edit Tab */}
                  {activeTab === 'edit' && (
                    <form className="space-y-5" onSubmit={handleUpdate}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ชื่อ</label>
                          <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.firstName} onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))} required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">นามสกุล</label>
                          <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.lastName} onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))} required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">เบอร์โทร</label>
                        <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">อีเมล</label>
                        <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">ผู้ติดต่อฉุกเฉิน</label>
                        <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.emergencyContact} onChange={e => setEditForm(p => ({ ...p, emergencyContact: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">โทรศัพท์ฉุกเฉิน</label>
                        <input className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={editForm.emergencyPhone} onChange={e => setEditForm(p => ({ ...p, emergencyPhone: e.target.value }))} />
                      </div>
                      <button className="w-full py-2.5 bg-gradient-to-br from-primary-container to-primary text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50" disabled={working === `edit:${selectedTenant.id}`}>
                        {working === `edit:${selectedTenant.id}` ? 'กำลังบันทึก...' : 'บันทึก'}
                      </button>
                    </form>
                  )}

                  {/* LINE Tab */}
                  {activeTab === 'line' && (
                    <form className="space-y-5" onSubmit={handleLinkLine}>
                      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 mb-2">สถานะ LINE</div>
                        {selectedTenant.lineUserId ? (
                          <div className="flex items-center gap-2 text-sm text-on-surface">
                            <CheckCircle size={16} className="text-emerald-500" />
                            <span>เชื่อมต่อแล้ว:</span>
                            <code className="rounded bg-surface-container px-2 py-0.5 text-xs font-mono">{selectedTenant.lineUserId}</code>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                            <MessageCircle size={16} className="text-on-surface-variant" />
                            <span>ยังไม่เชื่อมต่อ</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">LINE User ID</label>
                        <input
                          className={`w-full px-4 py-2.5 bg-surface-container-low border rounded-lg text-sm focus:ring-2 focus:ring-primary ${lineIdError ? 'border-error/50' : 'border-outline-variant/30'}`}
                          value={lineUserId}
                          placeholder="ไอดีจาก LINE (เช่น Udf3k...)"
                          onChange={e => {
                            setLineUserId(e.target.value);
                            if (lineIdError) setLineIdError(null);
                          }}
                        />
                        {lineIdError ? (
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-error">
                            <XCircle size={12} className="shrink-0" />
                            {lineIdError}
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] text-on-surface-variant">ดูได้จาก LINE Official Account → ผู้ติดตาม → โค้ดผู้ใช้ (User ID)</p>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <button
                          className="flex-1 py-2.5 bg-gradient-to-br from-primary-container to-primary text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50"
                          disabled={working === `line:${selectedTenant.id}`}
                        >
                          {working === `line:${selectedTenant.id}` ? '...' : lineUserId ? 'อัพเดท LINE' : 'ลบ LINE'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Rooms Tab */}
                  {activeTab === 'rooms' && (
                    <div className="space-y-5">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">ห้องปัจจุบัน</div>
                        {selectedTenant.roomTenants?.length > 0 ? (
                          <div className="space-y-2">
                            {selectedTenant.roomTenants.map(rt => (
                              <div key={rt.id} className="flex items-center justify-between rounded-lg border border-outline-variant/10 px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <Home size={14} className="text-on-surface-variant" />
                                  <span className="text-sm font-semibold text-on-surface">{rt.roomNo}</span>
                                </div>
                                <button
                                  onClick={() => handleRemoveRoom(rt.roomNo)}
                                  disabled={working === `remove:${selectedTenant.id}:${rt.roomNo}`}
                                  className="text-xs font-semibold text-error hover:underline disabled:opacity-50"
                                >
                                  ถอน
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border-2 border-dashed border-outline-variant/30 px-4 py-4 text-center text-sm text-on-surface-variant">
                            ยังไม่มีห้อง
                          </div>
                        )}
                      </div>
                      <form className="space-y-3" onSubmit={handleAssignRoom}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">จัดสรรห้องใหม่</div>
                        <select className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:ring-2 focus:ring-primary" value={assignRoom} onChange={e => setAssignRoom(e.target.value)} required>
                          <option value="">— เลือกห้อง —</option>
                          {rooms.filter(r => r.roomStatus === 'VACANT').map(r => (
                            <option key={r.roomNo} value={r.roomNo}>{r.roomNo}</option>
                          ))}
                        </select>
                        <button className="w-full py-2.5 bg-gradient-to-br from-primary-container to-primary text-white text-sm font-bold rounded-lg shadow-md hover:opacity-90 transition-all disabled:opacity-50" disabled={!assignRoom || working === `assign:${selectedTenant.id}`}>
                          {working === `assign:${selectedTenant.id}` ? '...' : 'จัดสรร'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </>
            ) : null}
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
