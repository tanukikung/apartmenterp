'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Key, Pencil, Shield, UserPlus, Users, Loader2, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  pendingReset?: { id: string; createdAt: string; expiresAt: string } | null;
  isActive: boolean;
};

type CreateForm = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  role: string;
};

const EMPTY_FORM: CreateForm = {
  username: '',
  displayName: '',
  email: '',
  password: '',
  role: 'STAFF',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function roleBadgeClass(role: string): string {
  if (role === 'ADMIN' || role === 'OWNER') {
    return 'inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5';
  }
  return 'inline-flex items-center gap-1 rounded-full text-xs font-semibold px-2.5 py-0.5';
}

// ---------------------------------------------------------------------------
// Reset Password Button
// ---------------------------------------------------------------------------

function ResetPasswordButton({ userId, userDisplayName: _userDisplayName }: { userId: string; userDisplayName: string }) {
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const queryClient = useQueryClient();

  async function handleReset() {
    setResetting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถรีเซ็ตรหัสผ่าน');
      setSuccessMsg('รีเซ็ตรหัสผ่านสำเร็จ ผู้ใช้จะได้รับอีเมลหรือ SMS แนะนำการตั้งรหัสผ่านใหม่');
      setConfirmUserId(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถรีเซ็ตรหัสผ่าน');
    } finally {
      setResetting(false);
    }
  }

  if (successMsg) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-emerald-600" style={{ background: 'rgba(34,197,94,0.15)' }}>
        <RotateCcw className="h-3 w-3" /> {successMsg}
      </span>
    );
  }

  if (confirmUserId === userId) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleReset}
          disabled={resetting}
          className="inline-flex items-center gap-1 rounded-lg bg-[hsl(var(--primary))] text-white px-2.5 py-1 text-xs font-semibold hover:bg-[hsl(var(--primary))]/90 disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
        >
          {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          ยืนยัน
        </button>
        <button
          onClick={() => setConfirmUserId(null)}
          className="inline-flex items-center rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-2.5 py-1 text-xs font-medium text-[hsl(var(--card-foreground))] hover:bg-white/5 transition-all hover:scale-105 active:scale-95"
        >
          ยกเลิก
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirmUserId(userId)}
      className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20 transition-all hover:scale-105 active:scale-95"
    >
      <RotateCcw className="h-3 w-3" />
      รีเซ็ตรหัสผ่าน
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminUsersSettingsPage() {
  const queryClient = useQueryClient();

  const {
    isLoading,
    error: queryError,
    data: queryData,
    fetchStatus,
  } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users?page=1&pageSize=50', { cache: 'no-store' });
      if (res.status === 404) throw new Error('API_NOT_FOUND');
      const json = await res.json() as {
        success: boolean;
        data?: { users?: AdminUser[] } | AdminUser[];
        error?: { message?: string };
      };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถโหลดผู้ใช้');
      return json;
    },
    retry: false,
  });

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);

  useEffect(() => {
    if (fetchStatus === 'fetching') return;

    if (queryError) {
      const msg = queryError instanceof Error ? queryError.message : String(queryError);
      if (msg === 'API_NOT_FOUND') {
        setApiUnavailable(true);
        setUsers([]);
        setError(null);
      } else {
        setApiUnavailable(false);
        setError(msg);
        setUsers([]);
      }
    } else if (queryData) {
      setApiUnavailable(false);
      setError(null);
      const payload = queryData.data;
      if (Array.isArray(payload)) {
        setUsers(payload);
      } else if (payload && Array.isArray((payload as { users?: AdminUser[] }).users)) {
        setUsers((payload as { users: AdminUser[] }).users);
      } else {
        setUsers([]);
      }
    }
  }, [queryData, queryError, fetchStatus]);

  const load = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  }, [queryClient]);

  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    if (!form.username.trim()) { setFormError('กรุณากรอกชื่อผู้ใช้'); return; }
    if (!form.displayName.trim()) { setFormError('กรุณากรอกชื่อที่แสดง'); return; }
    if (form.password.length < 8) { setFormError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถสร้างผู้ใช้');
      setSuccessMessage(`สร้างผู้ใช้ "${form.username.trim()}" สำเร็จแล้ว`);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'ไม่สามารถสร้างผู้ใช้');
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof CreateForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', role: 'STAFF', isActive: true });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  function openEditForm(user: AdminUser) {
    setEditingUser(user);
    setEditForm({ displayName: user.displayName, role: user.role, isActive: user.isActive });
    setEditError(null);
  }

  function closeEditForm() {
    setEditingUser(null);
    setEditError(null);
  }

  async function handleEdit() {
    if (!editingUser) return;
    if (!editForm.displayName.trim()) { setEditError('กรุณากรอกชื่อที่แสดง'); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: editForm.displayName.trim(), role: editForm.role, isActive: editForm.isActive }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถแก้ไขผู้ใช้');
      setEditingUser(null);
      load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'ไม่สามารถแก้ไขผู้ใช้');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeactivate(user: AdminUser) {
    setDeactivatingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถปิดใช้งาน');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถปิดใช้งาน');
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleActivate(user: AdminUser) {
    setDeactivatingId(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      const json = (await res.json()) as { success: boolean; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารณเปิดใช้งาน');
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถเปิดใช้งาน');
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <main className="space-y-6">
      {/* Header */}
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] px-6 py-5" style={{ background: 'hsl(var(--card))' }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/settings"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  shadow-sm transition-all hover:scale-105 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">ผู้ใช้แอดมิน</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">สร้างและจัดการบัญชีแอดมินและพนักงาน</p>
            </div>
          </div>
          <button onClick={() => load()} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var([hsl(var(--color-border))]))]  px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95" disabled={isLoading}>
            {isLoading ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>
      </section>

      {/* Global alerts */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* API unavailable notice */}
      {apiUnavailable && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 px-5 py-4 text-sm" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            API จัดการผู้ใช้ไม่พร้อมใช้งาน คุณสามารถจัดการผู้ใช้ได้โดยตรงผ่านฐานข้อมูล
            endpoint <code className="rounded px-1 font-mono text-xs" style={{ background: 'rgba(251,191,36,0.15)' }}>/api/admin/users</code> คืนค่า 404
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Users table */}
        <section className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  overflow-hidden lg:col-span-2">
          <div className="border-b border-[hsl(var([hsl(var(--color-border))]))] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[hsl(var(--primary))]" />
                <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">ผู้ใช้แอดมินทั้งหมด</div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full  px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--card-foreground))]">
                {users.length} ผู้ใช้
              </span>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[hsl(var([hsl(var(--color-border))]))]">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ชื่อผู้ใช้</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ชื่อที่แสดง</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">บทบาท</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">รีเซ็ตรหัสผ่าน</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">จัดการ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">อัปเดต</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สร้าง</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><div className="h-4 w-28 animate-pulse rounded " /></td>
                      <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded " /></td>
                      <td className="px-4 py-3"><div className="h-4 w-14 animate-pulse rounded " /></td>
                      <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded " /></td>
                      <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded " /></td>
                      <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded " /></td>
                      <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded " /></td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[hsl(var(--on-surface-variant))]">
                      {apiUnavailable ? 'ไม่สามารถดึงข้อมูลผู้ใช้ — API ไม่พร้อมใช้งาน' : 'ไม่พบผู้ใช้แอดมิน'}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-[hsl(var([hsl(var(--color-border))]))] hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'hsl(var(--primary))', color: 'white' }}>
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-[hsl(var(--card-foreground))]">{user.username}</div>
                            {user.email ? <div className="text-xs text-[hsl(var(--on-surface-variant))]">{user.email}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[hsl(var(--on-surface-variant))]">{user.displayName}</td>
                      <td className="px-4 py-3">
                        <span className={roleBadgeClass(user.role)} style={{ background: user.role === 'ADMIN' || user.role === 'OWNER' ? 'rgba(139,92,246,0.15)' : 'rgba(100,116,139,0.15)', color: user.role === 'ADMIN' || user.role === 'OWNER' ? '#a78bfa' : '#94a3b8' }}>
                          <Shield className="h-3 w-3" />
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.isActive ? (
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold text-emerald-600" style={{ background: 'rgba(34,197,94,0.15)' }}>ใช้งาน</span>
                        ) : (
                          <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--on-surface-variant))] ">ไม่ใช้งาน</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ResetPasswordButton userId={user.id} userDisplayName={user.displayName} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditForm(user)}
                            title="แก้ไข"
                            className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 px-2.5 py-1 text-xs font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20 transition-all hover:scale-105 active:scale-95"
                          >
                            <Pencil className="h-3 w-3" />
                            แก้ไข
                          </button>
                          {user.isActive ? (
                            <button
                              onClick={() => void handleDeactivate(user)}
                              disabled={deactivatingId === user.id}
                              title="ปิดใช้งาน"
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                            >
                              {deactivatingId === user.id ? '...' : 'ปิดใช้งาน'}
                            </button>
                          ) : (
                            <button
                              onClick={() => void handleActivate(user)}
                              disabled={deactivatingId === user.id}
                              title="เปิดใช้งาน"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                            >
                              {deactivatingId === user.id ? '...' : 'เปิดใช้งาน'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[hsl(var(--on-surface-variant))]">{formatDate(user.updatedAt)}</td>
                      <td className="px-4 py-3 text-sm text-[hsl(var(--on-surface-variant))]">{formatDate(user.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Create user form */}
        <section className="rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  h-fit">
          <div className="border-b border-[hsl(var([hsl(var(--color-border))]))] px-5 py-4">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[hsl(var(--primary))]" />
              <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">สร้างผู้ใช้</div>
            </div>
          </div>

          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4 p-4">
            {formError && (
              <div className="rounded-lg border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>{formError}</div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">ชื่อผู้ใช้ <span className="text-red-500">*</span></label>
              <input type="text" className="w-full rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40" placeholder="เช่น manager01" value={form.username} onChange={(e) => field('username', e.target.value)} autoComplete="off" required />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">ชื่อที่แสดง <span className="text-red-500">*</span></label>
              <input type="text" className="w-full rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40" placeholder="เช่น ผู้จัดการอาคาร" value={form.displayName} onChange={(e) => field('displayName', e.target.value)} autoComplete="name" required />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">อีเมล <span className="text-[hsl(var(--on-surface-variant))] font-normal">(ไม่บังคับ)</span></label>
              <input type="email" className="w-full rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40" placeholder="เช่น manager@example.com" value={form.email} onChange={(e) => field('email', e.target.value)} autoComplete="email" />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">รหัสผ่าน <span className="text-red-500">*</span></label>
              <div className="relative">
                <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]" />
                <input type="password" className="w-full rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2 pl-9 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20 transition-all hover:border-[hsl(var(--primary))]/40" placeholder="อย่างน้อย 8 ตัวอักษร" value={form.password} onChange={(e) => field('password', e.target.value)} autoComplete="new-password" required minLength={8} />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">บทบาท <span className="text-red-500">*</span></label>
              <select className="w-full rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20" value={form.role} onChange={(e) => field('role', e.target.value)}>
                <option value="ADMIN">ADMIN</option>
                <option value="STAFF">STAFF</option>
              </select>
            </div>

            <button type="submit" className="mt-1 inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] text-white px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 hover:shadow-[0_4px_16px_rgba(0,0,0,0.25)] disabled:opacity-50" disabled={saving || apiUnavailable}>
              <UserPlus className="h-4 w-4" />
              {saving ? 'กำลังสร้าง...' : 'สร้างผู้ใช้'}
            </button>

            {apiUnavailable && <p className="text-center text-xs text-[hsl(var(--on-surface-variant))]">ปิดใช้งาน — API ไม่พร้อมใช้งาน</p>}
          </form>
        </section>

        {/* Edit user modal */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))]  p-6 shadow-xl">
              <h3 className="mb-4 text-base font-semibold text-[hsl(var(--card-foreground))]">แก้ไขผู้ใช้: {editingUser.username}</h3>
              {editError && (
                <div className="mb-4 rounded-lg border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>{editError}</div>
              )}
              <div className="flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">ชื่อที่แสดง</label>
                  <input type="text" value={editForm.displayName} onChange={(e) => setEditForm((p) => ({ ...p, displayName: e.target.value }))} className="w-full rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20" required />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--card-foreground))]">บทบาท</label>
                  <select value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))} className="w-full rounded-lg border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--card-foreground))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20">
                    <option value="ADMIN">ADMIN</option>
                    <option value="STAFF">STAFF</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="edit-isActive" checked={editForm.isActive} onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.checked }))} className="h-4 w-4 rounded border-[hsl(var([hsl(var(--color-border))]))] accent-[hsl(var(--primary))]" />
                  <label htmlFor="edit-isActive" className="text-sm text-[hsl(var(--card-foreground))]">เปิดใช้งาน</label>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button onClick={() => void handleEdit()} disabled={editSaving} className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] text-white px-4 py-2 text-sm font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50">
                  {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
                <button onClick={closeEditForm} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var([hsl(var(--color-border))]))]  px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95">
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}