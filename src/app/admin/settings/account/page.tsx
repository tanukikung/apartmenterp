'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Mail,
  Shield,
  Key,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  email?: string | null;
  forcePasswordChange: boolean;
  createdAt?: string;
};

export default function AccountSettingsPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  // Profile form
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.authenticated && data.data?.user) {
          const u = data.data.user as CurrentUser;
          setUser(u);
          setDisplayName(u.displayName || u.username);
          setEmail(u.email || '');
        } else {
          setUserError('ไม่สามารถดึงข้อมูลผู้ใช้');
        }
      })
      .catch(() => setUserError('เกิดข้อผิดพลาดในการเชื่อมต่อ'))
      .finally(() => setLoading(false));
  }, []);

  async function handleProfileUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim(), email: email.trim() }),
      });
      const data = await res.json() as { success: boolean; error?: { message?: string } };
      if (!data.success) throw new Error(data.error?.message ?? 'ไม่สามารถบันทึกข้อมูล');
      setUser((prev) => prev ? { ...prev, displayName: displayName.trim(), email: email.trim() } : prev);
      setProfileMsg({ type: 'success', text: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'รหัสผ่านใหม่ไม่ตรงกัน' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ type: 'error', text: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, password: newPassword, confirmPassword }),
      });
      const data = await res.json() as { success: boolean; error?: { message?: string } };
      if (!data.success) throw new Error(data.error?.message ?? 'ไม่สามารถเปลี่ยนรหัสผ่าน');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ type: 'success', text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setPasswordSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-[hsl(var(--color-surface))]" />
          <div className="space-y-2"><div className="h-5 w-40 animate-pulse rounded bg-[hsl(var(--color-surface))]" /><div className="h-4 w-60 animate-pulse rounded bg-[hsl(var(--color-surface))]" /></div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {[1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-[hsl(var(--color-surface))]" />)}
        </div>
      </main>
    );
  }

  if (userError || !user) {
    return (
      <main className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/settings" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] transition-all hover:scale-105 active:scale-95">
            <ArrowLeft className="h-4 w-4 text-[hsl(var(--color-text-3))]" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-[hsl(var(--color-text))]">ตั้งค่าบัญชี</h1>
            <p className="text-xs text-[hsl(var(--color-text-3))]">จัดการข้อมูลส่วนตัวและรหัสผ่าน</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 px-5 py-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          {userError ?? 'ไม่พบข้อมูลผู้ใช้'}
        </div>
      </main>
    );
  }

  const initials = user.displayName ? user.displayName.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase();
  const roleLabel: Record<string, string> = { OWNER: 'เจ้าของ', ADMIN: 'ผู้ดูแลระบบ', STAFF: 'พนักงาน' };

  return (
    <main className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/settings" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] transition-all hover:scale-105 active:scale-95">
          <ArrowLeft className="h-4 w-4 text-[hsl(var(--color-text-3))]" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-[hsl(var(--color-text))]">ตั้งค่าบัญชี</h1>
          <p className="text-xs text-[hsl(var(--color-text-3))]">จัดการข้อมูลส่วนตัวและรหัสผ่าน</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Profile card */}
        <div className="rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-3 border-b border-[hsl(var(--color-border))]">
            <User className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-[hsl(var(--color-text))]">ข้อมูลส่วนตัว</h2>
          </div>
          <div className="p-5">
            {/* Avatar + info */}
            <div className="flex items-center gap-4 mb-6">
              <div
                className="h-14 w-14 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 70%))', boxShadow: 'var(--glow-primary)' }}
              >
                {initials}
              </div>
              <div>
                <p className="text-base font-semibold text-[hsl(var(--color-text))]">{user.displayName || user.username}</p>
                <p className="text-sm text-[hsl(var(--color-text-3))]">@{user.username}</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa' }}>
                  <Shield className="h-3 w-3" />
                  {roleLabel[user.role] ?? user.role}
                </span>
              </div>
            </div>

            <form onSubmit={handleProfileUpdate} className="space-y-4">
              {profileMsg && (
                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium border ${
                  profileMsg.type === 'success'
                    ? 'border-emerald-500/30 text-emerald-600'
                    : 'border-red-500/30 text-red-600'
                }`} style={{ background: profileMsg.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
                  {profileMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {profileMsg.text}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--color-text))]">ชื่อที่แสดง</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--color-text-3))]" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] py-2.5 pl-10 pr-4 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text-3))]/50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="ชื่อที่แสดง"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--color-text))]">อีเมล <span className="text-[hsl(var(--color-text-3))] font-normal">(ไม่บังคับ)</span></label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--color-text-3))]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] py-2.5 pl-10 pr-4 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text-3))]/50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="email@example.com"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {profileSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Password card */}
        <div className="rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-3 border-b border-[hsl(var(--color-border))]">
            <Key className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-[hsl(var(--color-text))]">เปลี่ยนรหัสผ่าน</h2>
          </div>
          <div className="p-5">
            <form onSubmit={handlePasswordChange} className="space-y-4">
              {passwordMsg && (
                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium border ${
                  passwordMsg.type === 'success'
                    ? 'border-emerald-500/30 text-emerald-600'
                    : 'border-red-500/30 text-red-600'
                }`} style={{ background: passwordMsg.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
                  {passwordMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {passwordMsg.text}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--color-text))]">รหัสผ่านปัจจุบัน</label>
                <div className="relative">
                  <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--color-text-3))]" />
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] py-2.5 pl-10 pr-10 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text-3))]/50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="รหัสผ่านปัจจุบัน"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--color-text))]">รหัสผ่านใหม่</label>
                  <div className="relative">
                    <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--color-text-3))]" />
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] py-2.5 pl-10 pr-10 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text-3))]/50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="อย่างน้อย 8 ตัวอักษร"
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[hsl(var(--color-text))]">ยืนยันรหัสผ่านใหม่</label>
                  <div className="relative">
                    <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--color-text-3))]" />
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] py-2.5 pl-10 pr-10 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text-3))]/50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                      placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                      required
                      minLength={8}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="flex items-center gap-1.5 text-sm text-[hsl(var(--color-text-3))] hover:text-[hsl(var(--color-text))] transition-colors"
                >
                  {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showPasswords ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                </button>
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  {passwordSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {passwordSaving ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
