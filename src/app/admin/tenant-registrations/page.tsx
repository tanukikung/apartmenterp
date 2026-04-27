'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Edit2,
} from 'lucide-react';
import { motion } from 'framer-motion';

// Natural sort collator for room numbers (e.g. "101" < "201" < "1001")
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// ── Types ──────────────────────────────────────────────────────────────────────

type RegistrationStatus = 'PENDING' | 'CORRECTION_REQUESTED' | 'APPROVED' | 'REJECTED';

type RegistrationWarning =
  | 'DUPLICATE_LINE_ACCOUNT'
  | 'CLAIMED_ROOM_MISMATCH'
  | 'ROOM_FULL'
  | 'NO_PRIMARY_TENANT';

type Registration = {
  id: string;
  lineDisplayName: string | null;
  lineUserId: string;
  phone: string | null;
  claimedRoom: string | null;
  status: RegistrationStatus;
  createdAt: string;
  rejectionReason: string | null;
  correctionNote: string | null;
  warnings: RegistrationWarning[];
};

type StatusTab = 'ALL' | RegistrationStatus;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusStyle(s: RegistrationStatus) {
  if (s === 'APPROVED') return { bg: 'rgba(52,211,153,0.15)', text: '#34d399', border: 'rgba(52,211,153,0.3)' };
  if (s === 'REJECTED') return { bg: 'rgba(239,68,68,0.15)', text: '#dc2626', border: 'rgba(239,68,68,0.3)' };
  if (s === 'CORRECTION_REQUESTED') return { bg: 'rgba(251,191,36,0.15)', text: '#d97706', border: 'rgba(251,191,36,0.3)' };
  return { bg: 'rgba(251,191,36,0.15)', text: '#d97706', border: 'rgba(251,191,36,0.3)' };
}

function statusIcon(s: RegistrationStatus) {
  if (s === 'APPROVED') return <CheckCircle size={11} className="mr-1" />;
  if (s === 'REJECTED') return <XCircle size={11} className="mr-1" />;
  if (s === 'CORRECTION_REQUESTED') return <Edit2 size={11} className="mr-1" />;
  return <Clock size={11} className="mr-1" />;
}

function initials(name: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
    : (parts[0][0] ?? '?').toUpperCase();
}

const WARNING_META: Record<RegistrationWarning, { label: string; bg: string; text: string; border: string }> = {
  DUPLICATE_LINE_ACCOUNT: { label: 'LINE ถูกลิงก์กับผู้เช่าแล้ว', bg: 'rgba(239,68,68,0.15)', text: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  CLAIMED_ROOM_MISMATCH: { label: 'ไม่พบห้องที่ระบุ', bg: 'rgba(251,191,36,0.15)', text: '#d97706', border: 'rgba(251,191,36,0.3)' },
  ROOM_FULL: { label: 'ห้องเต็มแล้ว', bg: 'rgba(239,68,68,0.15)', text: '#dc2626', border: 'rgba(239,68,68,0.3)' },
  NO_PRIMARY_TENANT: { label: 'ห้องไม่มีผู้เช่าหลัก', bg: 'rgba(251,191,36,0.15)', text: '#d97706', border: 'rgba(251,191,36,0.3)' },
};

// ── Reject modal ──────────────────────────────────────────────────────────────

function RejectModal({
  onConfirm,
  onCancel,
  working,
}: {
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  working: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--glass-border))] glass-card p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-[hsl(var(--card-foreground))]">ปฏิเสธการลงทะเบียน</h2>
        <p className="mb-4 text-sm text-[hsl(var(--on-surface-variant))]">
          ระบุเหตุผลเพิ่มเติมได้ (ไม่บังคับ) ข้อมูลนี้จะถูกบันทึกพร้อมกับรายการ
        </p>
        <textarea
          className="w-full rounded-lg border border-[hsl(var(--glass-border))] glass-card px-3 py-2 text-sm text-[hsl(var(--card-foreground))] mb-4"
          placeholder="เหตุผลในการปฏิเสธ (ไม่บังคับ)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-white/5" onClick={onCancel} disabled={working}>
            ยกเลิก
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-red-500/30"
            onClick={() => onConfirm(reason)}
            disabled={working}
          >
            <XCircle size={14} />
            {working ? 'กำลังปฏิเสธ...' : 'ยืนยันปฏิเสธ'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Correction modal ──────────────────────────────────────────────────────────

function CorrectionModal({
  reg,
  onConfirm,
  onCancel,
  working,
}: {
  reg: Registration;
  onConfirm: (data: { phone: string; claimedRoom: string; correctionNote: string }) => void;
  onCancel: () => void;
  working: boolean;
}) {
  const [phone, setPhone] = useState(reg.phone ?? '');
  const [claimedRoom, setClaimedRoom] = useState(reg.claimedRoom ?? '');
  const [correctionNote, setCorrectionNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--glass-border))] glass-card p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-[hsl(var(--card-foreground))]">ขอแก้ไขข้อมูล</h2>
        <p className="mb-4 text-sm text-[hsl(var(--on-surface-variant))]">
          อัปเดตรายละเอียดการลงทะเบียนและส่งบันทึกขอแก้ไขไปยังผู้เช่า
        </p>

        <div className="mb-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[hsl(var(--on-surface-variant))]">โทรศัพท์</label>
            <input
              className="w-full rounded-lg border border-[hsl(var(--glass-border))] glass-card px-3 py-2 text-sm text-[hsl(var(--card-foreground))]"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="หมายเลขโทรศัพท์"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[hsl(var(--on-surface-variant))]">ห้องที่ระบุ</label>
            <input
              className="w-full rounded-lg border border-[hsl(var(--glass-border))] glass-card px-3 py-2 text-sm text-[hsl(var(--card-foreground))]"
              value={claimedRoom}
              onChange={(e) => setClaimedRoom(e.target.value)}
              placeholder="หมายเลขห้อง (เช่น 101)"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[hsl(var(--on-surface-variant))]">
              บันทึกขอแก้ไข <span className="text-red-600">*</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-[hsl(var(--glass-border))] glass-card px-3 py-2 text-sm text-[hsl(var(--card-foreground))]"
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              placeholder="อธิบายรายละเอียดที่ต้องแก้ไข…"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-white/5" onClick={onCancel} disabled={working}>
            ยกเลิก
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.15)] px-4 py-2 text-sm font-medium text-[#d97706] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[rgba(251,191,36,0.25)]"
            onClick={() => onConfirm({ phone, claimedRoom, correctionNote })}
            disabled={working || !correctionNote.trim()}
          >
            <Edit2 size={14} />
            {working ? 'กำลังบันทึก...' : 'ส่งข้อความขอแก้ไข'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TenantRegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Registration | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<Registration | null>(null);
  const [roomSearch] = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tenant-registrations?pageSize=100', { cache: 'no-store' });
      const json = await res.json() as { success: boolean; data?: { data: Registration[] }; error?: { message?: string } };
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถโหลดข้อมูลได้');
      const rows: Registration[] = json.data?.data ?? [];
      setRegistrations(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function approve(reg: Registration) {
    setWorking(`approve:${reg.id}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-registrations/${reg.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json()) as { success: boolean; message?: string; error?: { message?: string } };
      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถอนุมัติได้');
      setMessage(`อนุมัติการลงทะเบียน ${reg.lineDisplayName ?? reg.lineUserId} แล้ว`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการอนุมัติ');
    } finally {
      setWorking(null);
    }
  }

  async function reject(reg: Registration, reason: string) {
    setWorking(`reject:${reg.id}`);
    setRejectTarget(null);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-registrations/${reg.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      }).then((r) => r.json()) as { success: boolean; error?: { message?: string } };
      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถปฏิเสธได้');
      setMessage(`ปฏิเสธการลงทะเบียน ${reg.lineDisplayName ?? reg.lineUserId} แล้ว`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการปฏิเสธ');
    } finally {
      setWorking(null);
    }
  }

  async function requestCorrection(
    reg: Registration,
    data: { phone: string; claimedRoom: string; correctionNote: string }
  ) {
    setWorking(`correction:${reg.id}`);
    setCorrectionTarget(null);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/tenant-registrations/${reg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: data.phone || undefined,
          claimedRoom: data.claimedRoom || undefined,
          correctionNote: data.correctionNote,
          requestCorrection: true,
        }),
      }).then((r) => r.json()) as { success: boolean; error?: { message?: string } };
      if (!res.success) throw new Error(res.error?.message ?? 'ไม่สามารถบันทึกได้');
      setMessage(`ขอแก้ไขสำหรับ ${reg.lineDisplayName ?? reg.lineUserId} แล้ว`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการขอแก้ไข');
    } finally {
      setWorking(null);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  const counts = {
    ALL: registrations.length,
    PENDING: registrations.filter((r) => r.status === 'PENDING').length,
    CORRECTION_REQUESTED: registrations.filter((r) => r.status === 'CORRECTION_REQUESTED').length,
    APPROVED: registrations.filter((r) => r.status === 'APPROVED').length,
    REJECTED: registrations.filter((r) => r.status === 'REJECTED').length,
  };

  // Count APPROVED registrations per claimed room for occupancy warnings
  const approvedPerRoom = new Map<string, number>();
  for (const r of registrations) {
    if (r.status === 'APPROVED' && r.claimedRoom) {
      const rn = r.claimedRoom;
      approvedPerRoom.set(rn, (approvedPerRoom.get(rn) ?? 0) + 1);
    }
  }

  const searchLower = roomSearch.trim().toLowerCase();
  const visible = registrations
    .filter((r) => activeTab === 'ALL' || r.status === activeTab)
    .filter((r) => !searchLower || (r.claimedRoom ?? '').toLowerCase().includes(searchLower))
    .sort((a, b) => naturalCollator.compare(a.claimedRoom ?? '', b.claimedRoom ?? ''));

  const TABS: { id: StatusTab; label: string }[] = [
    { id: 'ALL', label: 'ทั้งหมด' },
    { id: 'PENDING', label: 'รอตรวจ' },
    { id: 'CORRECTION_REQUESTED', label: 'แก้ไข' },
    { id: 'APPROVED', label: 'อนุมัติ' },
    { id: 'REJECTED', label: 'ปฏิเสธ' },
  ];

  const isActionable = (reg: Registration) =>
    reg.status === 'PENDING' || reg.status === 'CORRECTION_REQUESTED';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var(--glass-border))] glass-card px-6 py-5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">ลงทะเบียนผู้เช่า</h1>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
              ตรวจสอบและดำเนินการคำขอลงทะเบียน LINE จากผู้เช่าใหม่
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full glass-card px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--card-foreground))]">
              <Clock size={11} className="mr-1" />
              {counts.PENDING} รอตรวจ
            </span>
            {counts.CORRECTION_REQUESTED > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: 'rgba(251,191,36,0.15)', color: '#d97706' }}>
                <Edit2 size={11} className="mr-1" />
                {counts.CORRECTION_REQUESTED} แก้ไข
              </span>
            )}
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-white/5"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              รีเฟรช
            </button>
          </div>
        </div>
      </section>

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399' }}>
          <CheckCircle size={15} className="shrink-0" />
          {message}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card overflow-hidden">
        {/* ── Status tabs ──────────────────────────────────────────────────── */}
        <div className="flex overflow-x-auto border-b border-[hsl(var(--glass-border))]" style={{ background: 'hsl(var(--card))' }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3.5 text-sm font-medium transition-all ${
                  active
                    ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                    : 'border-transparent text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--card-foreground))]'
                }`}
              >
                {tab.label}
                <span
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    active ? 'glass-card text-[hsl(var(--primary))]' : 'glass-card text-[hsl(var(--on-surface-variant))]'
                  }`}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Registration list ─────────────────────────────────────────────── */}
        <div className="p-5">
          {loading ? (
            <div className="py-14 text-center text-[hsl(var(--on-surface-variant))]">กำลังโหลดรายการลงทะเบียน...</div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl glass-card">
                <MessageSquare size={22} className="text-[hsl(var(--on-surface-variant))]" />
              </div>
              <div>
                <div className="font-medium text-[hsl(var(--card-foreground))]">
                  {activeTab === 'PENDING' ? 'ไม่มีรายการรอตรวจ' : 'ไม่มีรายการที่จะแสดง'}
                </div>
                <div className="text-sm text-[hsl(var(--on-surface-variant))]">
                  {activeTab === 'PENDING'
                    ? 'ทุกรายการได้รับการดำเนินการแล้ว'
                    : `ไม่พบรายการ${activeTab === 'APPROVED' ? 'ที่อนุมัติ' : activeTab === 'REJECTED' ? 'ที่ปฏิเสธ' : 'ที่รอดำเนินการ'}`}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((reg) => {
                const st = statusStyle(reg.status);
                return (
                  <div
                    key={reg.id}
                    className="flex flex-col gap-4 rounded-xl border p-5 shadow-sm transition-all hover:shadow-md"
                    style={{
                      borderColor: reg.status === 'PENDING'
                        ? 'rgba(251,191,36,0.3)'
                        : reg.status === 'CORRECTION_REQUESTED'
                        ? 'rgba(251,191,36,0.3)'
                        : 'hsl(var(--glass-border))',
                      background: 'hsl(var(--card))',
                    }}
                  >
                    {/* Top row: avatar + name + badge */}
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl glass-card text-sm font-bold text-[hsl(var(--primary))]">
                        {initials(reg.lineDisplayName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-[hsl(var(--card-foreground))]">
                          {reg.lineDisplayName ?? 'Unknown'}
                        </div>
                        <div
                          className="truncate font-mono text-[10px] text-[hsl(var(--on-surface-variant))]"
                          title={reg.lineUserId}
                        >
                          {reg.lineUserId.slice(0, 20)}
                          {reg.lineUserId.length > 20 ? '…' : ''}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shrink-0`}
                        style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                        {statusIcon(reg.status)}
                        {reg.status.replace('_', ' ')}
                      </span>
                    </div>

                    {/* ── Warning badges ──────────────────────────────────── */}
                    {reg.warnings.length > 0 && (
                      <div className="space-y-1.5">
                        {reg.warnings.map((w) => (
                          <div
                            key={w}
                            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium`}
                            style={{ background: WARNING_META[w].bg, color: WARNING_META[w].text, borderColor: WARNING_META[w].border }}
                          >
                            <AlertTriangle size={11} className="shrink-0" />
                            {WARNING_META[w].label}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Details */}
                    <div className="grid gap-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[hsl(var(--on-surface-variant))]">โทรศัพท์</span>
                        <span className="font-medium text-[hsl(var(--card-foreground))]">{reg.phone ?? '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[hsl(var(--on-surface-variant))]">ห้องที่ระบุ</span>
                        <span className="font-medium text-[hsl(var(--card-foreground))]">{reg.claimedRoom ?? '-'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[hsl(var(--on-surface-variant))]">ลงทะเบียนเมื่อ</span>
                        <span className="text-[hsl(var(--on-surface-variant))]">{fmtDate(reg.createdAt)}</span>
                      </div>
                      {reg.correctionNote && (
                        <div className="mt-1 rounded-lg border px-3 py-2 text-xs" style={{ background: 'rgba(251,191,36,0.1)', color: '#d97706', borderColor: 'rgba(251,191,36,0.2)' }}>
                          <span className="font-semibold">บันทึกขอแก้ไข:</span> {reg.correctionNote}
                        </div>
                      )}
                      {reg.rejectionReason && (
                        <div className="mt-1 rounded-lg border px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626', borderColor: 'rgba(239,68,68,0.2)' }}>
                          <span className="font-semibold">เหตุผล:</span> {reg.rejectionReason}
                        </div>
                      )}
                    </div>

                    {/* Actions (PENDING + CORRECTION_REQUESTED) */}
                    {isActionable(reg) && (
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="flex gap-2">
                          <button
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-4 py-2 text-sm font-medium text-[#34d399] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-emerald-500/30 flex-1 justify-center disabled:opacity-50"
                            onClick={() => void approve(reg)}
                            disabled={
                              !!working ||
                              reg.warnings.includes('DUPLICATE_LINE_ACCOUNT') ||
                              reg.warnings.includes('ROOM_FULL') ||
                              !reg.claimedRoom
                            }
                            title={
                              reg.warnings.includes('DUPLICATE_LINE_ACCOUNT')
                                ? 'ไม่สามารถอนุมัติ: LINE ถูกลิงก์แล้ว'
                                : reg.warnings.includes('ROOM_FULL')
                                ? 'ไม่สามารถอนุมัติ: ห้องเต็มแล้ว'
                                : !reg.claimedRoom
                                ? 'ไม่สามารถอนุมัติ: ไม่ระบุห้อง'
                                : undefined
                            }
                          >
                            <CheckCircle size={13} />
                            {working === `approve:${reg.id}` ? 'กำลังอนุมัติ...' : 'อนุมัติ'}
                          </button>
                          <button
                            className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-red-500/30 disabled:opacity-50 flex-1 justify-center"
                            onClick={() => setRejectTarget(reg)}
                            disabled={!!working}
                          >
                            <XCircle size={13} />
                            ปฏิเสธ
                          </button>
                        </div>
                        <button
                          className="inline-flex items-center gap-2 rounded-lg border border-[rgba(251,191,36,0.3)] bg-[rgba(251,191,36,0.1)] px-4 py-2 text-sm font-medium text-[#d97706] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[rgba(251,191,36,0.2)] disabled:opacity-50 w-full justify-center"
                          onClick={() => setCorrectionTarget(reg)}
                          disabled={!!working}
                        >
                          <Edit2 size={13} />
                          {working === `correction:${reg.id}` ? 'กำลังบันทึก...' : 'ขอแก้ไข'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── KPI summary ────────────────────────────────────────────────────── */}
      {!loading && registrations.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface-variant))] flex items-center gap-1.5">
              <Users size={12} />
              ทั้งหมด
            </div>
            <div className="text-xl font-semibold text-[hsl(var(--card-foreground))]">{counts.ALL}</div>
          </div>
          <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface-variant))] flex items-center gap-1.5">
              <Clock size={12} />
              รอตรวจ
            </div>
            <div className={`text-xl font-semibold ${counts.PENDING > 0 ? 'text-[#d97706]' : 'text-[hsl(var(--card-foreground))]'}`}>
              {counts.PENDING}
            </div>
          </div>
          <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface-variant))] flex items-center gap-1.5">
              <CheckCircle size={12} />
              อนุมัติ
            </div>
            <div className="text-xl font-semibold text-[#34d399]">{counts.APPROVED}</div>
          </div>
          <div className="rounded-xl border border-[hsl(var(--glass-border))] glass-card p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface-variant))] flex items-center gap-1.5">
              <XCircle size={12} />
              ปฏิเสธ
            </div>
            <div className={`text-xl font-semibold ${counts.REJECTED > 0 ? 'text-red-600' : 'text-[hsl(var(--card-foreground))]'}`}>
              {counts.REJECTED}
            </div>
          </div>
        </section>
      )}

      {/* ── Reject modal ──────────────────────────────────────────────────── */}
      {rejectTarget && (
        <RejectModal
          working={working === `reject:${rejectTarget.id}`}
          onConfirm={(reason) => void reject(rejectTarget, reason)}
          onCancel={() => setRejectTarget(null)}
        />
      )}

      {/* ── Correction modal ───────────────────────────────────────────────── */}
      {correctionTarget && (
        <CorrectionModal
          reg={correctionTarget}
          working={working === `correction:${correctionTarget.id}`}
          onConfirm={(data) => void requestCorrection(correctionTarget, data)}
          onCancel={() => setCorrectionTarget(null)}
        />
      )}
    </motion.div>
  );
}
