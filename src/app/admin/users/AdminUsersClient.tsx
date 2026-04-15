'use client';

import { useEffect, useMemo, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { RejectDialog } from '@/components/ui/RejectDialog';

type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
  forcePasswordChange: boolean;
  createdAt: string;
  updatedAt: string;
  pendingReset: {
    id: string;
    createdAt: string;
    expiresAt: string;
  } | null;
};

type PendingRequestRow = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
};

const emptyCreateForm = {
  displayName: '',
  username: '',
  email: '',
  password: '',
  role: 'STAFF' as 'ADMIN' | 'STAFF',
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [working, setWorking] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ username: string; url: string; expiresAt: string } | null>(null);
  const [promptTarget, setPromptTarget] = useState<{ user: AdminUserRow; field: 'displayName' | 'password' } | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [rejectModalTarget, setRejectModalTarget] = useState<PendingRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users').then((response) => response.json());
      if (!res.success) {
        throw new Error(res.error?.message || 'ไม่สามารถโหลดข้อมูลการเข้าถึง');
      }
      setUsers(res.data.users);
      setPendingRequests(res.data.pendingRequests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลการเข้าถึง');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const stats = useMemo(() => {
    const active = users.filter((user) => user.isActive).length;
    const owners = users.filter((user) => user.role === 'ADMIN').length;
    const pendingResets = users.filter((user) => user.pendingReset).length;
    const forcedPasswordChange = users.filter((user) => user.forcePasswordChange).length;
    return { active, owners, pendingResets, forcedPasswordChange, pendingRequests: pendingRequests.length };
  }, [users, pendingRequests]);

  async function createUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setWorking('create-user');
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'ไม่สามารถสร้างบัญชี');
      }

      setCreateForm(emptyCreateForm);
      setMessage(res.message || 'สร้างบัญชีแล้ว');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถสร้างบัญชี');
    } finally {
      setWorking(null);
    }
  }

  async function patchUser(user: AdminUserRow, updates: Record<string, unknown>) {
    setWorking(user.id);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'ไม่สามารถอัปเดตบัญชี');
      }

      setMessage(res.message || `อัปเดต ${user.username} แล้ว`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถอัปเดตบัญชี');
    } finally {
      setWorking(null);
    }
  }

  async function issueReset(user: AdminUserRow) {
    setWorking(`reset:${user.id}`);
    setError(null);
    setMessage(null);
    setResetLink(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'ไม่สามารถสร้างลิงก์รีเซ็ต');
      }

      setResetLink({
        username: user.username,
        url: res.data.resetUrl,
        expiresAt: res.data.expiresAt,
      });
      setMessage(res.message || 'ออกลิงก์รีเซ็ตแล้ว');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถสร้างลิงก์รีเซ็ต');
    } finally {
      setWorking(null);
    }
  }

  async function revokeReset(user: AdminUserRow) {
    setWorking(`revoke:${user.id}`);
    setError(null);
    setMessage(null);
    setResetLink(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'DELETE',
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'ไม่สามารถเพิกถอนลิงก์รีเซ็ต');
      }

      setMessage(res.message || 'เพิกถอนลิงก์รีเซ็ตแล้ว');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถเพิกถอนลิงก์รีเซ็ต');
    } finally {
      setWorking(null);
    }
  }

  async function approveRequest(request: PendingRequestRow) {
    setWorking(`approve:${request.id}`);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/registration-requests/${request.id}/approve`, {
        method: 'POST',
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'ไม่สามารถอนุมัติคำขอ');
      }

      setMessage(res.message || `อนุมัติ ${request.username} แล้ว`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถอนุมัติคำขอ');
    } finally {
      setWorking(null);
    }
  }

  async function rejectRequest(request: PendingRequestRow) {
    setWorking(`reject:${request.id}`);
    setError(null);
    setMessage(null);

    const reason = '';

    try {
      const res = await fetch(`/api/admin/registration-requests/${request.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'ไม่สามารถปฏิเสธคำขอ');
      }

      setMessage(res.message || `ปฏิเสธ ${request.username} แล้ว`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถปฏิเสธคำขอ');
    } finally {
      setWorking(null);
    }
  }

  const handlePromptConfirm = async (value: string) => {
    if (!promptTarget) return;
    setPromptLoading(true);
    try {
      if (promptTarget.field === 'displayName') {
        if (value && value !== promptTarget.user.displayName) {
          await patchUser(promptTarget.user, { displayName: value });
        }
      } else if (promptTarget.field === 'password') {
        if (value && value.length >= 8) {
          await patchUser(promptTarget.user, { password: value });
        }
      }
    } finally {
      setPromptLoading(false);
      setPromptTarget(null);
    }
  };

  async function handleRejectConfirm() {
    if (!rejectModalTarget) return;
    setWorking(`reject:${rejectModalTarget.id}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/registration-requests/${rejectModalTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      }).then((response) => response.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถปฏิเสธคำขอ');
      setMessage(res.message || `ปฏิเสธ ${rejectModalTarget.username} แล้ว`);
      setRejectModalTarget(null);
      setRejectReason('');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถปฏิเสธคำขอ');
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return (
      <main className="space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-on-primary">การเข้าถึงของเจ้าของและพนักงาน</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">กำลังโหลดข้อมูลการควบคุมการเข้าถึง...</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-on-primary">การเข้าถึงของเจ้าของและพนักงาน</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">อนุมัติการลงทะเบียนของพนักงาน สร้างบัญชีโดยตรง และจัดการสถานะข้อมูลรับรอง</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.active} ใช้งาน</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.owners} เจ้าของ</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.pendingRequests} รอดำเนินการ</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.pendingResets} รีเซ็ต</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.forcedPasswordChange} ต้องเปลี่ยนรหัส</span>
          </div>
        </div>
      </div>

      {message ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {resetLink ? (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-on-surface">ออกลิงก์รีเซ็ตสำหรับ {resetLink.username}</div>
              <div className="text-sm text-on-surface-variant">หมดอายุ <ClientOnly fallback="-">{new Date(resetLink.expiresAt).toLocaleString('th-TH')}</ClientOnly></div>
            </div>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-emerald-600" onClick={() => navigator.clipboard.writeText(resetLink.url)}>
              คัดลอกลิงก์รีเซ็ต
            </button>
          </div>
          <div className="mt-3 rounded-3xl border border-primary-container bg-primary-container/60 px-4 py-3 text-sm text-on-surface">{resetLink.url}</div>
        </div>
      ) : null}

      {pendingRequests.length > 0 ? (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary shadow-lg">
          <div className="border-b border-outline-variant/50 px-6 py-4">
            <h2 className="text-base font-semibold text-on-primary">การลงทะเบียนพนักงานที่รอดำเนินการ</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="px-4 py-3 text-left font-medium text-on-surface">ผู้สมัคร</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">ขอเมื่อ</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">การตัดสินใจ</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((request) => (
                  <tr key={request.id} className="border-b border-outline-variant/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-on-surface">{request.displayName}</div>
                      <div className="text-xs text-on-surface-variant">{request.username}{request.email ? ` | ${request.email}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant"><ClientOnly fallback="-">{new Date(request.createdAt).toLocaleString('th-TH')}</ClientOnly></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-emerald-600" onClick={() => void approveRequest(request)} disabled={working === `approve:${request.id}`}>
                          {working === `approve:${request.id}` ? 'กำลังอนุมัติ...' : 'อนุมัติ'}
                        </button>
                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container" onClick={() => { setRejectModalTarget(request); setRejectReason(''); }} disabled={working === `reject:${request.id}`}>
                          {working === `reject:${request.id}` ? 'กำลังปฏิเสธ...' : 'ปฏิเสธ'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary shadow-lg">
          <div className="border-b border-outline-variant/50 px-6 py-4">
            <h2 className="text-base font-semibold text-on-primary">สร้างบัญชีโดยเจ้าของ</h2>
          </div>
          <form className="grid gap-4 p-4" onSubmit={createUser}>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">ชื่อที่แสดง</label>
              <input className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={createForm.displayName} onChange={(e) => setCreateForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="พนักงานปฏิบัติการ" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">ชื่อผู้ใช้</label>
              <input className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={createForm.username} onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="ops.staff" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">อีเมล</label>
              <input className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="staff@example.com" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">บทบาท</label>
              <select className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={createForm.role} onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value as 'ADMIN' | 'STAFF' }))}>
                <option value="STAFF">พนักงาน</option>
                <option value="ADMIN">เจ้าของ</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">รหัสผ่านชั่วคราว</label>
              <input className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" type="password" value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="อย่างน้อย 8 ตัวอักษร" />
            </div>
            <div className="rounded-3xl border border-primary-container bg-primary-container px-4 py-3 text-sm text-on-surface">
              บัญชีที่สร้างใหม่จะถูกบังคับให้เปลี่ยนรหัสผ่านชั่วคราวนี้เมื่อเข้าสู่ระบบครั้งแรก
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-emerald-600" disabled={working === 'create-user'}>
              {working === 'create-user' ? 'กำลังสร้าง...' : 'สร้างบัญชี'}
            </button>
          </form>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary shadow-lg">
          <div className="border-b border-outline-variant/50 px-6 py-4">
            <h2 className="text-base font-semibold text-on-primary">บัญชีที่อนุมัติแล้ว</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="px-4 py-3 text-left font-medium text-on-surface">ผู้ใช้</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">บทบาท</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">สถานะ</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">สถานะรหัสผ่าน</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">รีเซ็ต</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-outline-variant/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-on-surface">{user.displayName}</div>
                      <div className="text-xs text-on-surface-variant">{user.username}{user.email ? ` | ${user.email}` : ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={user.role} onChange={(e) => void patchUser(user, { role: e.target.value })} disabled={working === user.id}>
                        <option value="ADMIN">เจ้าของ</option>
                        <option value="STAFF">พนักงาน</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" className={`inline-flex items-center gap-2 rounded-lg border ${user.isActive ? 'border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container' : 'border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container'}`} onClick={() => void patchUser(user, { isActive: !user.isActive })} disabled={working === user.id}>
                        {user.isActive ? 'ใช้งาน' : 'ไม่ใช้งาน'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface ${user.forcePasswordChange ? 'bg-amber-100 text-amber-700' : ''}`}>
                        {user.forcePasswordChange ? 'รหัสผ่านชั่วคราว' : 'เป็นปัจจุบัน'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.pendingReset ? (
                        <div className="text-xs text-on-surface-variant">รอดำเนินการถึง <ClientOnly fallback="-">{new Date(user.pendingReset.expiresAt).toLocaleString('th-TH')}</ClientOnly></div>
                      ) : (
                        <div className="text-xs text-outline-variant">ไม่มีลิงก์รีเซ็ตที่ใช้งานอยู่</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          onClick={() => setPromptTarget({ user, field: 'displayName' })}
                          disabled={working === user.id}
                        >
                          เปลี่ยนชื่อ
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          onClick={() => setPromptTarget({ user, field: 'password' })}
                          disabled={working === user.id}
                        >
                          ตั้งรหัสชั่วคราว
                        </button>
                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-emerald-600" onClick={() => void issueReset(user)} disabled={working === `reset:${user.id}`}>
                          {working === `reset:${user.id}` ? 'กำลังออกลิงก์...' : 'ออกลิงก์รีเซ็ต'}
                        </button>
                        {user.pendingReset ? (
                          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container" onClick={() => void revokeReset(user)} disabled={working === `revoke:${user.id}`}>
                            {working === `revoke:${user.id}` ? 'กำลังเพิกถอน...' : 'เพิกถอนรีเซ็ต'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Prompt dialog for display name / password */}
      {promptTarget && (
        <PromptDialog
          open
          title={promptTarget.field === 'displayName' ? 'อัปเดตชื่อที่แสดง' : 'ตั้งรหัสผ่านชั่วคราว'}
          description={promptTarget.field === 'password' ? 'อย่างน้อย 8 ตัวอักษร' : undefined}
          label={promptTarget.field === 'displayName' ? 'ชื่อที่แสดง' : 'รหัสผ่านชั่วคราว'}
          placeholder={promptTarget.field === 'displayName' ? 'ชื่อที่แสดง' : 'รหัสผ่านชั่วคราว (อย่างน้อย 8 ตัวอักษร)'}
          defaultValue={promptTarget.user.displayName}
          confirmLabel={promptTarget.field === 'displayName' ? 'บันทึก' : 'บันทึกรหัสผ่าน'}
          loading={promptLoading}
          onConfirm={handlePromptConfirm}
          onCancel={() => setPromptTarget(null)}
        />
      )}

      {/* Reject modal for registration requests */}
      {rejectModalTarget && (
        <RejectDialog
          open
          username={rejectModalTarget.username}
          loading={working === `reject:${rejectModalTarget.id}`}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectModalTarget(null)}
        />
      )}
    </main>
  );
}
