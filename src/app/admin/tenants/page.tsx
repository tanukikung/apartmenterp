'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus, Home, Search, Inbox, CheckCircle, MessageCircle, XCircle, Send } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useUrlState } from '@/hooks/useUrlState';

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

type Tab = 'edit' | 'line' | 'rooms' | 'message';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-blue-500/20 text-blue-600 border border-blue-500/25',
  'bg-emerald-500/20 text-emerald-600 border border-emerald-500/25',
  'bg-amber-500/20 text-amber-600 border border-amber-500/25',
  'bg-rose-500/20 text-rose-600 border border-rose-500/25',
  'bg-violet-500/20 text-violet-600 border border-violet-500/25',
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '').toUpperCase();
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useUrlState<string>('q', '');
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

  // Message dialog
  const [_messageDialogOpen, setMessageDialogOpen] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageSuccess, setMessageSuccess] = useState(false);

  // ─── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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
        if (page > 100) break;
      }

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

  // ─── Send message ───────────────────────────────────────────────────────────

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTenant?.lineUserId) return;
    setMessageSending(true);
    setMessageError(null);
    setMessageSuccess(false);
    try {
      const convRes = await fetch(`/api/conversations?lineUserId=${encodeURIComponent(selectedTenant.lineUserId)}&pageSize=1`, { cache: 'no-store' }).then(r => r.json());
      const convList = convRes.success ? (convRes.data?.data ?? []) : [];
      if (!convList.length) {
        throw new Error('ไม่พบการสนทนากับผู้เช่านี้ กรุณาลิงก์ LINE UID ก่อน');
      }
      const conv = convList[0];
      const res = await fetch(`/api/conversations/${conv.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageText }),
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถส่งข้อความได้');
      setMessageSuccess(true);
      setMessageText('');
      setTimeout(() => setMessageDialogOpen(false), 1500);
    } catch (err) {
      setMessageError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setMessageSending(false);
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">

      {/* Header */}
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--primary))]">ผู้เช่า</h1>
          <p className="mt-1 text-sm text-[hsl(var(--on-surface-variant))]">จัดการผู้เช่า เชื่อมต่อ LINE และจัดสรรห้อง</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 pr-4 py-2 bg-[hsl(var(--color-surface))]/50 border border-[hsl(var(--color-border))] rounded-lg text-sm w-[220px] text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface-variant))]/40 focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" placeholder="ค้นหาชื่อ ห้อง เบอร์โทร..." />
          </div>
          <button onClick={() => { setShowCreate(true); setDrawerOpen(true); setSelectedTenant(null); }} className="inline-flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200">
            <Plus size={14} strokeWidth={2.5} />
            เพิ่มผู้เช่า
          </button>
        </div>
      </section>

      {/* Alerts */}
      {message && (
        <div className="px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-600 font-medium backdrop-blur">
          {message}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 font-medium backdrop-blur">
          {error}
        </div>
      )}

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/60 backdrop-blur shadow-[var(--glass-shadow)] p-5 hover:border-white/12 hover:shadow-[0_0_24px_rgba(255,255,255,0.06)] transition-all duration-300 group cursor-default">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary))]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ผู้เช่าทั้งหมด</p>
          <div className="text-2xl font-extrabold tracking-tight text-[hsl(var(--primary))]">{tenants.length}</div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/15 bg-[hsl(var(--color-surface))]/60 backdrop-blur shadow-[var(--glass-shadow)] p-5 hover:border-emerald-500/25 hover:shadow-[0_0_24px_rgba(34,197,94,0.15)] transition-all duration-300 group cursor-default">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">เชื่อม LINE</p>
          <div className="text-2xl font-extrabold tracking-tight text-emerald-600">{tenants.filter(t=>t.lineUserId).length}</div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-amber-500/15 bg-[hsl(var(--color-surface))]/60 backdrop-blur shadow-[var(--glass-shadow)] p-5 hover:border-amber-500/25 hover:shadow-[0_0_24px_rgba(251,191,36,0.15)] transition-all duration-300 group cursor-default">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">มีห้อง</p>
          <div className="text-2xl font-extrabold tracking-tight text-amber-600">{tenants.filter(t=>t.roomTenants?.length>0).length}</div>
        </div>
      </section>

      {/* Tenant List */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/40 backdrop-blur shadow-[var(--glass-shadow)]">
          <EmptyState
            icon={<Inbox className="h-7 w-7" />}
            title={search.trim() ? `ไม่พบผู้เช่าที่ตรงกับ "${search}"` : 'ยังไม่มีผู้เช่า'}
            description={search.trim() ? 'ลองป้อนคำค้นอื่นหรือล้างการค้นหา' : 'เพิ่มผู้เช่าใหม่เพื่อเริ่มต้น'}
            action={search.trim()
              ? { label: 'ล้างคำค้นหา', onClick: () => setSearch('') }
              : { label: 'เพิ่มผู้เช่า', onClick: () => setShowCreate(true) }}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/40 backdrop-blur shadow-[var(--glass-shadow)] overflow-hidden">
          {/* Mobile card view */}
          <div className="md:hidden divide-y divide-[hsl(var(--color-border))]">
            {filtered.map((t) => {
              const name = t.fullName || 'ไม่ระบุชื่อ';
              return (
                <button
                  key={`m-${t.id}`}
                  onClick={() => openTenantDrawer(t)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150 active:scale-[0.98]"
                >
                  <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${avatarColor(name)}`}>
                    {initials(name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[hsl(var(--on-surface))] truncate">{name}</span>
                      {t.lineUserId && (
                        <CheckCircle size={12} className="text-emerald-600 shrink-0" aria-label="LINE เชื่อมแล้ว" />
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[hsl(var(--on-surface-variant))]">{t.phone || '—'}</div>
                    {t.roomTenants?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.roomTenants.map((rt) => (
                          <span key={rt.id} className="inline-flex items-center px-2 py-0.5 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] text-[10px] font-bold rounded-full border border-[hsl(var(--primary))]/15">{rt.roomNo}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--color-border))]">
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ผู้เช่า</th>
                  <th className="hidden md:table-cell px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เบอร์โทร</th>
                  <th className="hidden lg:table-cell px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">อีเมล</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ห้อง</th>
                  <th className="hidden lg:table-cell px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">LINE</th>
                  <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--color-border))]">
                {filtered.map((t) => {
                  const name = t.fullName || 'ไม่ระบุชื่อ';
                  return (
                    <tr key={t.id} className="hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150 group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${avatarColor(name)}`}>
                            {initials(name)}
                          </div>
                          <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">{name}</span>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 text-sm text-[hsl(var(--on-surface-variant))]">{t.phone || '—'}</td>
                      <td className="hidden lg:table-cell px-6 py-4 text-sm text-[hsl(var(--on-surface-variant))]">{t.email || '—'}</td>
                      <td className="px-6 py-4">
                        {t.roomTenants?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.roomTenants.map(rt => (
                              <span key={rt.id} className="inline-flex items-center px-2 py-0.5 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] text-[10px] font-bold rounded-full border border-[hsl(var(--primary))]/15">{rt.roomNo}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-[hsl(var(--on-surface-variant))]">ไม่มี</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-6 py-4">
                        {t.lineUserId ? (
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                            <CheckCircle size={12} />
                            เชื่อมแล้ว
                          </span>
                        ) : (
                          <span className="text-xs text-[hsl(var(--on-surface-variant))]">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openTenantDrawer(t)}
                          className="px-3 py-1.5 bg-[hsl(var(--primary))] text-white text-xs font-semibold rounded-lg hover:shadow-glow-primary hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200"
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
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={closeDrawer} style={{ animation: 'fade-in 200ms ease' }} />
          <div className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[hsl(var(--color-surface))]/80 backdrop-blur border-l border-[hsl(var(--color-border))] z-50 overflow-y-auto shadow-[-8px_0_32px_rgba(0,0,0,0.12)]" style={{ animation: 'slide-in-right 250ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div className="sticky top-0 bg-[hsl(var(--color-surface))]/90 backdrop-blur border-b border-[hsl(var(--color-border))] px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-bold text-[hsl(var(--primary))]">
                {showCreate ? 'เพิ่มผู้เช่าใหม่' : `จัดการ ${selectedTenant ? `${selectedTenant.firstName} ${selectedTenant.lastName}` : ''}`}
              </h2>
              <button onClick={closeDrawer} className="p-2 hover:bg-[hsl(var(--color-surface))]/[0.05] rounded-lg transition-colors active:scale-[0.95]">
                <X size={18} className="text-[hsl(var(--on-surface-variant))]" />
              </button>
            </div>

            {showCreate ? (
              <div className="p-6">
                <form className="space-y-5" onSubmit={handleCreate}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ชื่อ</label>
                      <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={createForm.firstName} placeholder="ชื่อ" onChange={e => setCreateForm(p => ({ ...p, firstName: e.target.value }))} required />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">นามสกุล</label>
                      <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={createForm.lastName} placeholder="นามสกุล" onChange={e => setCreateForm(p => ({ ...p, lastName: e.target.value }))} required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">เบอร์โทร</label>
                    <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={createForm.phone} placeholder="0xx-xxx-xxxx" onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">อีเมล</label>
                    <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" type="email" value={createForm.email} placeholder="email@example.com" onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ผู้ติดต่อฉุกเฉิน</label>
                    <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={createForm.emergencyContact} placeholder="ชื่อ + เบอร์โทร" onChange={e => setCreateForm(p => ({ ...p, emergencyContact: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">โทรศัพท์ฉุกเฉิน</label>
                    <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={createForm.emergencyPhone} placeholder="0xx-xxx-xxxx" onChange={e => setCreateForm(p => ({ ...p, emergencyPhone: e.target.value }))} />
                  </div>
                  <button className="w-full py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50" disabled={working === 'create'}>
                    {working === 'create' ? 'กำลังเพิ่ม...' : 'เพิ่มผู้เช่า'}
                  </button>
                </form>
              </div>
            ) : selectedTenant ? (
              <>
                {/* Tab Nav */}
                <div className="flex border-b border-[hsl(var(--color-border))]">
                  <button className={`flex-1 px-4 py-3 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${activeTab === 'edit' ? 'text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))]'}`} onClick={() => setActiveTab('edit')}>แก้ไขข้อมูล</button>
                  <button className={`flex-1 px-4 py-3 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${activeTab === 'line' ? 'text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))]'}`} onClick={() => setActiveTab('line')}>LINE</button>
                  <button className={`flex-1 px-4 py-3 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${activeTab === 'rooms' ? 'text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))]'}`} onClick={() => setActiveTab('rooms')}>ห้องพัก</button>
                  {selectedTenant.lineUserId && (
                    <button className={`flex-1 px-4 py-3 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${activeTab === 'message' ? 'text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))]'}`} onClick={() => setActiveTab('message')}>ข้อความ</button>
                  )}
                </div>
                <div className="p-6">

                  {/* Edit Tab */}
                  {activeTab === 'edit' && (
                    <form className="space-y-5" onSubmit={handleUpdate}>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ชื่อ</label>
                          <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={editForm.firstName} onChange={e => setEditForm(p => ({ ...p, firstName: e.target.value }))} required />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">นามสกุล</label>
                          <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={editForm.lastName} onChange={e => setEditForm(p => ({ ...p, lastName: e.target.value }))} required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">เบอร์โทร</label>
                        <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">อีเมล</label>
                        <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ผู้ติดต่อฉุกเฉิน</label>
                        <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={editForm.emergencyContact} onChange={e => setEditForm(p => ({ ...p, emergencyContact: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">โทรศัพท์ฉุกเฉิน</label>
                        <input className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={editForm.emergencyPhone} onChange={e => setEditForm(p => ({ ...p, emergencyPhone: e.target.value }))} />
                      </div>
                      <button className="w-full py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50" disabled={working === `edit:${selectedTenant.id}`}>
                        {working === `edit:${selectedTenant.id}` ? 'กำลังบันทึก...' : 'บันทึก'}
                      </button>
                    </form>
                  )}

                  {/* LINE Tab */}
                  {activeTab === 'line' && (
                    <form className="space-y-5" onSubmit={handleLinkLine}>
                      <div className="rounded-xl border border-indigo-500/15 bg-indigo-500/5 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-2">สถานะ LINE</div>
                        {selectedTenant.lineUserId ? (
                          <div className="flex items-center gap-2 text-sm text-[hsl(var(--on-surface))]">
                            <CheckCircle size={16} className="text-emerald-600" />
                            <span>เชื่อมต่อแล้ว:</span>
                            <code className="rounded bg-white/5 px-2 py-0.5 text-xs font-mono text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]">{selectedTenant.lineUserId}</code>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-sm text-[hsl(var(--on-surface-variant))]">
                            <MessageCircle size={16} className="text-[hsl(var(--on-surface-variant))]" />
                            <span>ยังไม่เชื่อมต่อ</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">LINE User ID</label>
                        <input
                          className={`w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 ${lineIdError ? 'border-red-500/40' : 'border-[hsl(var(--color-border))]'}`}
                          value={lineUserId}
                          placeholder="ไอดีจาก LINE (เช่น Udf3k...)"
                          onChange={e => {
                            setLineUserId(e.target.value);
                            if (lineIdError) setLineIdError(null);
                          }}
                        />
                        {lineIdError ? (
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-red-400">
                            <XCircle size={12} className="shrink-0" />
                            {lineIdError}
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] text-[hsl(var(--on-surface-variant))]">ดูได้จาก LINE Official Account → ผู้ติดตาม → โค้ดผู้ใช้ (User ID)</p>
                        )}
                      </div>
                      <div className="flex gap-3">
                        <button
                          className="flex-1 py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
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
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--on-surface-variant))] mb-3">ห้องปัจจุบัน</div>
                        {selectedTenant.roomTenants?.length > 0 ? (
                          <div className="space-y-2">
                            {selectedTenant.roomTenants.map(rt => (
                              <div key={rt.id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--color-border))] bg-white/[0.03] px-4 py-3 backdrop-blur-[12px]">
                                <div className="flex items-center gap-2">
                                  <Home size={14} className="text-[hsl(var(--primary))]" />
                                  <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">{rt.roomNo}</span>
                                </div>
                                <button
                                  onClick={() => handleRemoveRoom(rt.roomNo)}
                                  disabled={working === `remove:${selectedTenant.id}:${rt.roomNo}`}
                                  className="text-[11px] font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                                >
                                  ถอน
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border-2 border-dashed border-[hsl(var(--color-border))] px-4 py-4 text-center text-sm text-[hsl(var(--on-surface-variant))]">
                            ยังไม่มีห้อง
                          </div>
                        )}
                      </div>
                      <form className="space-y-3" onSubmit={handleAssignRoom}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--on-surface-variant))]">จัดสรรห้องใหม่</div>
                        <select className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer" value={assignRoom} onChange={e => setAssignRoom(e.target.value)} required>
                          <option value="">— เลือกห้อง —</option>
                          {rooms.filter(r => r.roomStatus === 'VACANT').map(r => (
                            <option key={r.roomNo} value={r.roomNo}>{r.roomNo}</option>
                          ))}
                        </select>
                        <button className="w-full py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50" disabled={!assignRoom || working === `assign:${selectedTenant.id}`}>
                          {working === `assign:${selectedTenant.id}` ? '...' : 'จัดสรร'}
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Message Tab */}
                  {activeTab === 'message' && (
                    <form className="space-y-5" onSubmit={handleSendMessage}>
                      <div className="rounded-xl border border-[hsl(var(--primary))]/15 bg-[hsl(var(--primary))]/5 p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--primary))] mb-1">ส่งข้อความ LINE</div>
                        <div className="text-sm text-[hsl(var(--on-surface-variant))]">
                          ส่งข้อความไปยัง <span className="font-semibold text-[hsl(var(--on-surface))]">{selectedTenant.fullName}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-2">ข้อความ</label>
                        <textarea
                          className="w-full px-4 py-2.5 bg-[hsl(var(--color-surface))]/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 min-h-[120px] resize-y"
                          value={messageText}
                          placeholder="พิมพ์ข้อความที่ต้องการส่ง..."
                          onChange={e => setMessageText(e.target.value)}
                          required
                        />
                      </div>
                      {messageError && (
                        <div className="text-xs text-red-400 flex items-center gap-1">
                          <XCircle size={12} /> {messageError}
                        </div>
                      )}
                      {messageSuccess && (
                        <div className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                          <CheckCircle size={12} /> ส่งข้อความสำเร็จแล้ว
                        </div>
                      )}
                      <button
                        type="submit"
                        className="w-full py-2.5 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg shadow-glow-primary hover:shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
                        disabled={messageSending || !messageText.trim()}
                      >
                        {messageSending ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            กำลังส่ง...
                          </>
                        ) : (
                          <>
                            <Send size={14} /> ส่งข้อความ
                          </>
                        )}
                      </button>
                    </form>
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
    </div>
  );
}
