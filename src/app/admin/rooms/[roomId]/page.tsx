'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  DoorOpen,
  FileText,
  Hash,
  History,
  Home,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Wrench,
  XCircle,
  X,
  Save,
  UserPlus,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types — match actual Prisma schema & API responses
// ─────────────────────────────────────────────────────────────────────────────

type RoomStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE' | 'OWNER_USE';

interface Room {
  roomNo: string;
  floorNo: number;
  defaultAccountId: string;
  defaultRuleCode: string;
  defaultRentAmount: string;
  hasFurniture: boolean;
  defaultFurnitureAmount: string;
  roomStatus: RoomStatus;
  lineUserId: string | null;
  createdAt: string;
  updatedAt: string;
  roomTenants: Array<{
    role: string;
    tenant: {
      id: string;
      fullName: string;
      phone: string | null;
      lineUserId: string | null;
    } | null;
  }>;
}

interface Contract {
  id: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  deposit: number | null;
  status: string;
  tenant?: {
    id: string;
    fullName: string;
    phone: string | null;
    lineUserId: string | null;
  };
}

interface Invoice {
  id: string;
  invoiceNumber: string | null;
  year: number;
  month: number;
  totalAmount: number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  room?: { roomNo: string } | null;
}

interface MaintenanceTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorName: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt(date: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('th-TH', opts ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount: number | string | null | undefined): string {
  if (amount == null) return '—';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(num);
}

function fmtDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// ─────────────────────────────────────────────────────────────────────────────
// Dark Glass Status badges
// ─────────────────────────────────────────────────────────────────────────────

function glassRoomStatusBadge(status: RoomStatus | string): { label: string; cls: string } {
  if (status === 'VACANT') return { label: 'ว่าง', cls: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 shadow-[0_0_12px_rgba(34,197,94,0.25)]' };
  if (status === 'OCCUPIED') return { label: 'มีผู้เช่า', cls: 'bg-blue-500/15 text-blue-600 border border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.25)]' };
  if (status === 'MAINTENANCE') return { label: 'ซ่อมบำรุง', cls: 'bg-amber-500/15 text-amber-600 border border-amber-500/20 shadow-[0_0_12px_rgba(251,191,36,0.25)]' };
  if (status === 'OWNER_USE') return { label: 'ใช้เอง', cls: 'bg-violet-500/15 text-violet-600 border border-violet-500/20 shadow-[0_0_12px_rgba(139,92,246,0.25)]' };
  return { label: status, cls: 'bg-[hsl(var(--color-surface))] text-white/60 border border-[hsl(var(--color-border))]' };
}

function invoiceStatusBadge(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    DRAFT:     { label: 'ร่าง',        cls: 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]' },
    GENERATED: { label: 'สร้างแล้ว',   cls: 'bg-blue-500/15 text-blue-600 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.2)]' },
    SENT:      { label: 'ส่งแล้ว',     cls: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 shadow-glow-primary' },
    VIEWED:    { label: 'เปิดดูแล้ว', cls: 'bg-violet-500/15 text-violet-600 border border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.2)]' },
    PAID:      { label: 'ชำระแล้ว',   cls: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.25)]' },
    OVERDUE:   { label: 'เกินกำหนด', cls: 'bg-red-500/15 text-red-600 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.25)]' },
  };
  return map[status] ?? { label: status, cls: 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]' };
}

function maintenanceStatusBadge(status: string): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    OPEN:        { label: 'รอดำเนินการ', cls: 'bg-red-500/15 text-red-600 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.25)]' },
    IN_PROGRESS: { label: 'กำลังซ่อม',  cls: 'bg-amber-500/15 text-amber-600 border border-amber-500/20 shadow-[0_0_10px_rgba(251,191,36,0.25)]' },
    DONE:        { label: 'เสร็จแล้ว',   cls: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.25)]' },
    CLOSED:      { label: 'ปิดแล้ว',     cls: 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]' },
  };
  return map[status] ?? { label: status, cls: 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]' };
}

function GlassStatusBadge({ status, cls }: { status: string; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls} transition-all duration-200`}>
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading / Error / Empty
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ message = 'กำลังโหลด...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-[hsl(var(--primary))]" />
      <p className="text-sm text-[hsl(var(--on-surface-variant))]">{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <XCircle className="h-8 w-8 text-red-600" />
      <p className="text-sm text-[hsl(var(--on-surface-variant))]">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--primary))] hover:underline">
          <RefreshCw className="h-3.5 w-3.5" /> ลองใหม่
        </button>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2">
      <Icon className="h-10 w-10 text-[hsl(var(--on-surface-variant))]/30" />
      <p className="text-sm font-medium text-[hsl(var(--on-surface-variant))]">{title}</p>
      <p className="text-xs text-[hsl(var(--on-surface-variant))]/60">{description}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Info row — Dark Glass
// ─────────────────────────────────────────────────────────────────────────────

function GlassInfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur-[12px] px-4 py-3.5 hover:bg-[hsl(var(--color-surface))]/[0.05] transition-all duration-200">
      {icon && <span className="mt-0.5 shrink-0 text-[hsl(var(--on-surface-variant))]">{icon}</span>}
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[hsl(var(--on-surface-variant))]">{label}</div>
        <div className="mt-0.5 text-sm font-medium text-[hsl(var(--on-surface))]">{value}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ room, editingRoom, setEditingRoom, editForm, setEditForm, editSaving, editError, editSuccess, saveEditRoom, accounts, rules }: {
  room: Room;
  editingRoom: boolean;
  setEditingRoom: (v: boolean) => void;
  editForm: { defaultRentAmount: string; hasFurniture: boolean; defaultFurnitureAmount: string; defaultRuleCode: string; defaultAccountId: string };
  setEditForm: (f: typeof editForm) => void;
  editSaving: boolean;
  editError: string | null;
  editSuccess: boolean;
  saveEditRoom: (e: React.FormEvent) => void;
  accounts: Array<{ id: string; name: string }>;
  rules: Array<{ code: string; descriptionTh: string }>;
}) {
  const statusCfg = glassRoomStatusBadge(room.roomStatus);

  if (editingRoom) {
    return (
      <form onSubmit={saveEditRoom} className="space-y-5">
        <section className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
          <div className="border-b border-[hsl(var(--color-border))] bg-white/[0.04] backdrop-blur px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--on-surface))]">
              <Pencil className="h-4 w-4 text-[hsl(var(--primary))]" />
              แก้ไขข้อมูลห้อง
            </div>
            <button type="button" onClick={() => setEditingRoom(false)} className="p-1.5 hover:bg-[hsl(var(--color-surface))] rounded-lg transition-colors active:scale-[0.95]">
              <X size={16} className="text-[hsl(var(--on-surface-variant))]" />
            </button>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-1.5">ค่าเช่า (บาท)</label>
              <input type="number" min={0} className="w-full px-4 py-2.5 bg-white/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" value={editForm.defaultRentAmount} onChange={e => setEditForm({ ...editForm, defaultRentAmount: e.target.value })} required />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-1.5">บัญชีเริ่มต้น</label>
              <select className="w-full px-4 py-2.5 bg-white/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer" value={editForm.defaultAccountId} onChange={e => setEditForm({ ...editForm, defaultAccountId: e.target.value })}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))] mb-1.5">กฎเรียกเก็บ</label>
              <select className="w-full px-4 py-2.5 bg-white/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer" value={editForm.defaultRuleCode} onChange={e => setEditForm({ ...editForm, defaultRuleCode: e.target.value })}>
                {rules.map(r => <option key={r.code} value={r.code}>{r.descriptionTh}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="hasFurniture" className="w-4 h-4 rounded border-white/20 text-[hsl(var(--primary))] focus:ring-[hsl(var(--primary))]/40 cursor-pointer" checked={editForm.hasFurniture} onChange={e => setEditForm({ ...editForm, hasFurniture: e.target.checked })} />
              <label htmlFor="hasFurniture" className="text-sm font-medium text-[hsl(var(--on-surface))] cursor-pointer">มีเฟอร์นิเจอร์</label>
              {editForm.hasFurniture && (
                <input type="number" min={0} className="flex-1 px-4 py-2 bg-white/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200" placeholder="ค่าเฟอร์นิเจอร์" value={editForm.defaultFurnitureAmount} onChange={e => setEditForm({ ...editForm, defaultFurnitureAmount: e.target.value })} />
              )}
            </div>
          </div>
          <div className="border-t border-[hsl(var(--color-border))] px-4 py-3 flex items-center gap-2">
            {editError && <span className="text-xs text-red-600">{editError}</span>}
            {editSuccess && <span className="text-xs text-emerald-600 font-medium">บันทึกสำเร็จแล้ว</span>}
            <div className="flex-1" />
            <button type="button" onClick={() => setEditingRoom(false)} className="px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] border border-[hsl(var(--color-border))] rounded-lg hover:bg-[hsl(var(--color-surface))] transition-colors active:scale-[0.98]">
              ยกเลิก
            </button>
            <button type="submit" disabled={editSaving} className="inline-flex items-center gap-2 px-4 py-2 bg-[hsl(var(--primary))] text-white text-sm font-semibold rounded-lg hover:shadow-glow-primary hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
              <Save size={14} />
              {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </section>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {/* Room Info Grid */}
      <section className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
        <div className="border-b border-[hsl(var(--color-border))] bg-white/[0.04] backdrop-blur px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--on-surface))]">
            <Info className="h-4 w-4 text-[hsl(var(--primary))]" />
            ข้อมูลห้อง
          </div>
          <button
            onClick={() => setEditingRoom(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))]/15 px-3 py-1.5 text-[11px] font-semibold text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/25 shadow-glow-primary hover:bg-[hsl(var(--primary))]/25 active:scale-[0.98] transition-all duration-200"
          >
            <Pencil size={12} /> แก้ไขข้อมูลห้อง
          </button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <GlassInfoRow icon={<Hash className="h-4 w-4" />} label="หมายเลขห้อง" value={<span className="font-mono font-bold text-[hsl(var(--primary))]">{room.roomNo}</span>} />
          <GlassInfoRow icon={<Building2 className="h-4 w-4" />} label="ชั้น" value={`ชั้น ${room.floorNo}`} />
          <GlassInfoRow icon={<CircleDot className="h-4 w-4" />} label="สถานะ" value={<GlassStatusBadge status={statusCfg.label} cls={statusCfg.cls} />} />
          <GlassInfoRow icon={<DoorOpen className="h-4 w-4" />} label="สถานะระบบ" value={
            room.roomStatus === 'VACANT' ? 'ว่าง (พร้อมให้เช่า)' :
            room.roomStatus === 'OCCUPIED' ? 'มีผู้เช่า' :
            room.roomStatus === 'MAINTENANCE' ? 'ปิดซ่อมบำรุง' :
            'ใช้งานส่วนตัว'
          } />
          <GlassInfoRow icon={<BedDouble className="h-4 w-4" />} label="ค่าเช่าเริ่มต้น" value={fmtMoney(room.defaultRentAmount)} />
          {room.hasFurniture && (
            <GlassInfoRow icon={<BedDouble className="h-4 w-4" />} label="ค่าเฟอร์นิเจอร์" value={fmtMoney(room.defaultFurnitureAmount)} />
          )}
          <GlassInfoRow icon={<Building2 className="h-4 w-4" />} label="บัญชีเริ่มต้น" value={room.defaultAccountId} />
          <GlassInfoRow icon={<FileText className="h-4 w-4" />} label="กฎเรียกเก็บ" value={room.defaultRuleCode} />
        </div>
        <div className="border-t border-[hsl(var(--color-border))] px-4 py-3 flex items-center justify-between">
          <div className="text-xs text-[hsl(var(--on-surface-variant))]">
            สร้างเมื่อ {fmtDateTime(room.createdAt)} · อัปเดต {fmtDateTime(room.updatedAt)}
          </div>
        </div>
      </section>
    </div>
  );
}

function TenantTab({ roomNo, room, assigningTenant, setAssigningTenant, selectedTenantId, setSelectedTenantId, tenantOptions, assignLoading, assignError, assignSuccess, handleAssignTenant }: {
  roomNo: string;
  room: Room | null;
  assigningTenant: boolean;
  setAssigningTenant: (v: boolean) => void;
  selectedTenantId: string;
  setSelectedTenantId: (v: string) => void;
  tenantOptions: Array<{ id: string; fullName: string; phone: string | null }>;
  assignLoading: boolean;
  assignError: string | null;
  assignSuccess: boolean;
  handleAssignTenant: (e: React.FormEvent) => void;
}) {
  const router = useRouter();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts?roomNo=${encodeURIComponent(roomNo)}&status=ACTIVE&pageSize=1&sortBy=createdAt&sortOrder=desc`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่สามารถโหลดข้อมูลสัญญา');
      const items: Contract[] = json.data?.data ?? json.data ?? [];
      setContract(items.length > 0 ? items[0] : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!contract) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <FileText className="h-10 w-10 text-[hsl(var(--on-surface-variant))]/30" />
          <div className="text-center">
            <p className="text-sm font-medium text-[hsl(var(--on-surface-variant))]">ไม่มีสัญญาเช่า</p>
            <p className="text-xs text-[hsl(var(--on-surface-variant))]/60">ห้องนี้ไม่มีสัญญาเช่าที่ใช้งานอยู่</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void router.push('/admin/contracts?new=true')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--color-border))] bg-white/[0.05] px-4 py-2 text-[11px] font-semibold text-[hsl(var(--on-surface))] shadow-[var(--glass-shadow)] hover:bg-white/[0.08] active:scale-[0.98] transition-all duration-200 backdrop-blur"
            >
              <FileText size={12} />
              สร้างสัญญาเช่า
            </button>
            {room && room.roomStatus !== 'VACANT' && (
              <button
                onClick={() => setAssigningTenant(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-[11px] font-semibold text-white shadow-glow-primary shadow-glow-primary-hover active:scale-[0.98] transition-all duration-200"
              >
                <UserPlus size={12} />
                จัดสรรผู้เช่า
              </button>
            )}
          </div>
        </div>

        {/* Assign tenant form */}
        {assigningTenant && (
          <form onSubmit={handleAssignTenant} className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur p-5 space-y-4 shadow-[var(--glass-shadow)]">
            <div className="text-sm font-semibold text-[hsl(var(--on-surface))]">จัดสรรผู้เช่าให้ห้อง {roomNo}</div>
            <select
              className="w-full px-4 py-2.5 bg-white/[0.05] border border-[hsl(var(--color-border))] rounded-lg text-sm text-[hsl(var(--on-surface))] focus:outline-none focus:border-[hsl(var(--primary))]/50 focus:ring-2 focus:ring-[hsl(var(--primary))]/20 backdrop-blur transition-all duration-200 cursor-pointer"
              value={selectedTenantId}
              onChange={e => setSelectedTenantId(e.target.value)}
              required
            >
              <option value="">— เลือกผู้เช่า —</option>
              {tenantOptions.map(t => (
                <option key={t.id} value={t.id}>{t.fullName} {t.phone ? `(${t.phone})` : ''}</option>
              ))}
            </select>
            {assignError && <div className="text-xs text-red-600">{assignError}</div>}
            {assignSuccess && <div className="text-xs text-emerald-600 font-medium">จัดสรรสำเร็จแล้ว</div>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setAssigningTenant(false)} className="flex-1 py-2 border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] text-sm font-medium text-[hsl(var(--on-surface))] rounded-lg hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-200 backdrop-blur">
                ยกเลิก
              </button>
              <button type="submit" disabled={assignLoading || !selectedTenantId} className="flex-1 py-2 bg-[hsl(var(--primary))] text-white text-sm font-bold rounded-lg hover:shadow-glow-primary hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] disabled:opacity-50 transition-all duration-200">
                {assignLoading ? 'กำลังจัดสรร...' : 'จัดสรร'}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  const t = contract.tenant;

  return (
    <div className="space-y-5">
      {/* Tenant Info */}
      {t && (
        <section className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
          <div className="border-b border-[hsl(var(--color-border))] bg-white/[0.04] backdrop-blur px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--on-surface))]">
              <FileText className="h-4 w-4 text-[hsl(var(--primary))]" />
              ผู้เช่าปัจจุบัน
            </div>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <GlassInfoRow icon={<FileText className="h-4 w-4" />} label="ชื่อ-นามสกุล" value={t.fullName} />
            <GlassInfoRow icon={<Info className="h-4 w-4" />} label="โทรศัพท์" value={t.phone ?? '—'} />
            <GlassInfoRow
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="LINE"
              value={t.lineUserId ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]">
                  เชื่อมต่อแล้ว
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-[11px] font-semibold text-white/40 border border-[hsl(var(--color-border))]">
                  ยังไม่เชื่อมต่อ
                </span>
              )}
            />
          </div>
        </section>
      )}

      {/* Contract Info */}
      <section className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
        <div className="border-b border-[hsl(var(--color-border))] bg-white/[0.04] backdrop-blur px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--on-surface))]">
            <FileText className="h-4 w-4 text-[hsl(var(--primary))]" />
            สัญญาเช่าที่ใช้งาน
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <GlassInfoRow icon={<Calendar className="h-4 w-4" />} label="วันเริ่มสัญญา" value={fmt(contract.startDate)} />
          <GlassInfoRow icon={<Calendar className="h-4 w-4" />} label="วันสิ้นสุด" value={contract.endDate ? fmt(contract.endDate) : 'ไม่กำหนด'} />
          <GlassInfoRow icon={<FileText className="h-4 w-4" />} label="ค่าเช่ารายเดือน" value={<span className="text-[hsl(var(--primary))] font-semibold">{fmtMoney(contract.monthlyRent)}</span>} />
          <GlassInfoRow icon={<FileText className="h-4 w-4" />} label="เงินมัดจำ" value={contract.deposit != null ? fmtMoney(contract.deposit) : '—'} />
          <GlassInfoRow
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="สถานะสัญญา"
            value={<GlassStatusBadge status={contract.status === 'ACTIVE' ? 'ใช้งาน' : contract.status} cls={contract.status === 'ACTIVE' ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 shadow-[0_0_10px_rgba(34,197,94,0.2)]' : 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]'} />}
          />
          <GlassInfoRow icon={<Hash className="h-4 w-4" />} label="รหัสสัญญา" value={<span className="font-mono text-xs text-[hsl(var(--on-surface-variant))]">{contract.id.slice(0, 8)}…</span>} />
        </div>
      </section>
    </div>
  );
}

function InvoicesTab({ roomNo }: { roomNo: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices?roomNo=${encodeURIComponent(roomNo)}&pageSize=20&sortBy=createdAt&sortOrder=desc`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่สามารถโหลดใบแจ้งหนี้');
      const items: Invoice[] = json.data?.data ?? json.data ?? [];
      setInvoices(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (invoices.length === 0) return <EmptyState icon={FileText} title="ไม่มีใบแจ้งหนี้" description="ยังไม่มีการออกใบแจ้งหนี้สำหรับห้องนี้" />;

  return (
    <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
      <div className="border-b border-[hsl(var(--color-border))] bg-white/[0.04] backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--on-surface))]">
          <FileText className="h-4 w-4 text-[hsl(var(--primary))]" />
          ใบแจ้งหนี้
        </div>
        <span className="text-xs text-[hsl(var(--on-surface-variant))]">{invoices.length} รายการ</span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[hsl(var(--color-border))]">
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เลขที่ใบแจ้งหนี้</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ประจำเดือน</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ยอดรวม</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ครบกำหนด</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const badge = invoiceStatusBadge(inv.status);
              return (
                <tr key={inv.id} className="border-b border-white/5 hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150">
                  <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--on-surface))]">{inv.invoiceNumber ?? inv.id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">{TH_MONTHS[inv.month - 1]} {inv.year}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[hsl(var(--on-surface))]">{fmtMoney(inv.totalAmount)}</td>
                  <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">{fmt(inv.dueDate)}</td>
                  <td className="px-4 py-3"><GlassStatusBadge status={badge.label} cls={badge.cls} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaintenanceTab({ roomNo }: { roomNo: string }) {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/maintenance?roomNo=${encodeURIComponent(roomNo)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่สามารถโหลดรายการแจ้งซ่อม');
      const all: MaintenanceTicket[] = Array.isArray(json.data) ? json.data : (json.data?.data ?? []);
      setTickets(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (tickets.length === 0) return <EmptyState icon={Wrench} title="ไม่มีรายการแจ้งซ่อม" description="ไม่มีรายการแจ้งซ่อมสำหรับห้องนี้" />;

  return (
    <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
      <div className="border-b border-[hsl(var(--color-border))] bg-white/[0.04] backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--on-surface))]">
          <Wrench className="h-4 w-4 text-[hsl(var(--primary))]" />
          รายการแจ้งซ่อม
        </div>
        <span className="text-xs text-[hsl(var(--on-surface-variant))]">{tickets.length} รายการ</span>
      </div>
      <div className="divide-y divide-white/5">
        {tickets.map(ticket => {
          const badge = maintenanceStatusBadge(ticket.status);
          return (
            <div key={ticket.id} className="flex items-start justify-between gap-4 px-4 py-4 hover:bg-[hsl(var(--color-surface))]/[0.03] transition-colors duration-150">
              <div className="flex items-start gap-3">
                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                  ticket.status === 'OPEN' ? 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                  ticket.status === 'IN_PROGRESS' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' :
                  ticket.status === 'DONE' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-white/30'
                }`} />
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--on-surface))]">{ticket.title}</p>
                  {ticket.description && <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5 line-clamp-2">{ticket.description}</p>}
                  <p className="text-xs text-[hsl(var(--on-surface-variant))]/60 mt-1">{fmtDateTime(ticket.createdAt)}</p>
                </div>
              </div>
              <GlassStatusBadge status={badge.label} cls={badge.cls} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryTab({ roomNo }: { roomNo: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-logs?entityId=${encodeURIComponent(roomNo)}&limit=100`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่สามารถโหลดประวัติ');
      const all: AuditLogEntry[] = json.data?.rows ?? json.data ?? [];
      setLogs(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (logs.length === 0) return <EmptyState icon={History} title="ไม่มีประวัติ" description="ไม่พบรายการประวัติสำหรับห้องนี้" />;

  return (
    <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
      <div className="border-b border-[hsl(var(--color-border))] bg-white/[0.04] backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--on-surface))]">
          <History className="h-4 w-4 text-[hsl(var(--primary))]" />
          ประวัติการดำเนินการ
        </div>
        <span className="text-xs text-[hsl(var(--on-surface-variant))]">{logs.length} รายการ</span>
      </div>
      <div className="divide-y divide-white/5">
        {logs.map((log, i) => (
          <div key={log.id} className="flex gap-4 px-4 py-4 hover:bg-white/[0.02] transition-colors duration-150">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary))] mt-1.5 shrink-0 shadow-glow-primary" />
              {i < logs.length - 1 && <div className="w-px flex-1 bg-white/10 mt-1" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-sm font-semibold text-[hsl(var(--on-surface))]">{log.action}</span>
                  {log.actorName && <span className="text-xs text-[hsl(var(--on-surface-variant))] ml-2">โดย {log.actorName}</span>}
                </div>
                <span className="text-xs text-[hsl(var(--on-surface-variant))] shrink-0">{fmtDateTime(log.createdAt)}</span>
              </div>
              {log.details && Object.keys(log.details).length > 0 && (
                <pre className="mt-1.5 rounded-lg bg-[hsl(var(--color-surface))]/[0.03] px-3 py-2 text-xs text-[hsl(var(--on-surface-variant))] overflow-x-auto whitespace-pre-wrap break-words border border-white/5 backdrop-blur-[12px]">
                  {JSON.stringify(log.details, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'overview' | 'tenant' | 'invoices' | 'maintenance' | 'history';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview',    label: 'ภาพรวม',     icon: Home },
  { id: 'tenant',      label: 'สัญญา/ผู้เช่า', icon: FileText },
  { id: 'invoices',    label: 'ใบแจ้งหนี้',   icon: FileText },
  { id: 'maintenance', label: 'แจ้งซ่อม',     icon: Wrench },
  { id: 'history',     label: 'ประวัติ',       icon: History },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function RoomDetailPage() {
  const params = useParams<{ roomId: string }>();
  const _router = useRouter();
  const roomNo = (() => {
    try { return decodeURIComponent(params.roomId ?? ''); }
    catch { return params.roomId ?? ''; }
  })();

  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Inline edit state
  const [editingRoom, setEditingRoom] = useState(false);
  const [editForm, setEditForm] = useState({ defaultRentAmount: '', hasFurniture: false, defaultFurnitureAmount: '', defaultRuleCode: '', defaultAccountId: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  // Tenant assignment state
  const [assigningTenant, setAssigningTenant] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<Array<{ id: string; fullName: string; phone: string | null }>>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Accounts and rules for dropdowns
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string }>>([]);
  const [rules, setRules] = useState<Array<{ code: string; descriptionTh: string }>>([]);

  const loadRoom = useCallback(async () => {
    if (!roomNo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomNo)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'ไม่พบห้องพัก');
      setRoom(json.data as Room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setLoading(false);
    }
  }, [roomNo]);

  useEffect(() => { loadRoom(); }, [loadRoom]);

  // Load accounts and rules for dropdowns
  useEffect(() => {
    async function loadMeta() {
      try {
        const [accRes, ruleRes] = await Promise.all([
          fetch('/api/bank-accounts', { cache: 'no-store' }).then(r => r.json()),
          fetch('/api/billing-rules', { cache: 'no-store' }).then(r => r.json()),
        ]);
        if (accRes.success) setAccounts(accRes.data ?? []);
        if (ruleRes.success) setRules(ruleRes.data ?? []);
      } catch { /* ignore */ }
    }
    void loadMeta();
  }, []);

  // Start edit mode
  function _startEditRoom() {
    if (!room) return;
    setEditForm({
      defaultRentAmount: String(room.defaultRentAmount),
      hasFurniture: room.hasFurniture,
      defaultFurnitureAmount: String(room.defaultFurnitureAmount),
      defaultRuleCode: room.defaultRuleCode,
      defaultAccountId: room.defaultAccountId,
    });
    setEditError(null);
    setEditSuccess(false);
    setEditingRoom(true);
  }

  async function saveEditRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(room.roomNo)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultRentAmount: Number(editForm.defaultRentAmount),
          hasFurniture: editForm.hasFurniture,
          defaultFurnitureAmount: Number(editForm.defaultFurnitureAmount),
          defaultRuleCode: editForm.defaultRuleCode,
          defaultAccountId: editForm.defaultAccountId,
        }),
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถบันทึกได้');
      setEditSuccess(true);
      setEditingRoom(false);
      await loadRoom();
      setTimeout(() => setEditSuccess(false), 3000);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setEditSaving(false);
    }
  }

  // Load tenants for assignment
  useEffect(() => {
    if (!assigningTenant) return;
    async function loadTenants() {
      try {
        const res = await fetch('/api/tenants?pageSize=200', { cache: 'no-store' }).then(r => r.json());
        if (res.success) {
          const all: Array<{ id: string; fullName: string; phone: string | null }> = [];
          const chunk: Array<{ id: string; fullName: string; phone: string | null }> = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
          all.push(...chunk);
          setTenantOptions(all);
        }
      } catch { /* ignore */ }
    }
    void loadTenants();
  }, [assigningTenant]);

  async function handleAssignTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!room || !selectedTenantId) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(room.roomNo)}/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          role: 'PRIMARY',
          moveInDate: new Date().toISOString().split('T')[0],
        }),
      }).then(r => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถจัดสรรได้');
      setAssignSuccess(true);
      setSelectedTenantId('');
      setAssigningTenant(false);
      await loadRoom();
      setTimeout(() => setAssignSuccess(false), 3000);
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setAssignLoading(false);
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="space-y-6">
        <section className="rounded-2xl border border-[hsl(var(--color-border))] bg-gradient-to-br from-[hsl(var(--primary))]/20 to-[hsl(var(--primary))]/5 backdrop-blur px-6 py-5 shadow-[var(--glass-shadow)]">
          <div className="flex items-center gap-3">
            <Link href="/admin/rooms" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-white/[0.05] shadow-[var(--glass-shadow)] hover:bg-white/[0.1] active:scale-[0.95] transition-all duration-200">
              <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-[hsl(var(--on-surface))]">รายละเอียดห้อง</h1>
              <p className="text-sm text-[hsl(var(--on-surface-variant))]">กำลังโหลด...</p>
            </div>
          </div>
        </section>
        <div className="flex justify-center py-20"><Spinner /></div>
      </main>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────
  if (error || !room) {
    return (
      <main className="space-y-6">
        <section className="rounded-2xl border border-[hsl(var(--color-border))] bg-gradient-to-br from-[hsl(var(--primary))]/20 to-[hsl(var(--primary))]/5 backdrop-blur px-6 py-5 shadow-[var(--glass-shadow)]">
          <div className="flex items-center gap-3">
            <Link href="/admin/rooms" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--color-border))] bg-white/[0.05] shadow-[var(--glass-shadow)]">
              <ArrowLeft className="h-4 w-4 text-[hsl(var(--primary))]" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-[hsl(var(--on-surface))]">รายละเอียดห้อง</h1>
            </div>
          </div>
        </section>
        <div className="rounded-xl border border-red-500/15 bg-red-500/5 px-5 py-4 text-sm text-red-600 backdrop-blur shadow-[0_0_12px_rgba(239,68,68,0.15)]">
          {error ?? 'ไม่พบห้องพัก'}
        </div>
        <button
          onClick={() => void loadRoom()}
          className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-white/[0.05] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] shadow-[var(--glass-shadow)] hover:bg-white/[0.1] active:scale-[0.98] transition-all duration-200 backdrop-blur"
        >
          <RefreshCw className="h-4 w-4" /> ลองใหม่
        </button>
      </main>
    );
  }

  const statusCfg = glassRoomStatusBadge(room.roomStatus);

  return (
    <main className="space-y-5 pt-6 pb-8">
      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <nav className="flex items-center gap-1.5 text-sm text-[hsl(var(--on-surface-variant))]">
        <Link href="/admin/rooms" className="hover:text-[hsl(var(--on-surface))] transition-colors">ห้องพัก</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-[hsl(var(--on-surface))]">{room.roomNo}</span>
      </nav>

      {/* ── Page header — Dark Glass Hero ─────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-xl bg-[hsl(var(--color-surface))]/60 backdrop-blur border border-[hsl(var(--color-border))] shadow-[var(--glass-shadow)] px-6 py-5">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary))]/10 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(var(--primary))]/5 rounded-full blur-[80px]" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20 shadow-glow-primary">
              <BedDouble className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-[hsl(var(--on-surface))]">ห้อง {room.roomNo}</h1>
                <GlassStatusBadge status={statusCfg.label} cls={room.roomStatus === 'VACANT' ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20 shadow-[0_0_12px_rgba(34,197,94,0.25)]' : 'bg-blue-500/15 text-blue-600 border border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.25)]'} />
              </div>
              <p className="text-sm text-[hsl(var(--on-surface-variant))] mt-0.5">
                ชั้น {room.floorNo} · ค่าเช่า {fmtMoney(room.defaultRentAmount)}/เดือน
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/rooms"
              className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-white/[0.05] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] shadow-[var(--glass-shadow)] hover:bg-white/[0.1] active:scale-[0.98] transition-all duration-200 backdrop-blur"
            >
              <ArrowLeft className="h-4 w-4" /> กลับ
            </Link>
            <button
              onClick={() => setEditingRoom(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-glow-primary shadow-glow-primary-hover hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] transition-all duration-200"
            >
              <Pencil className="h-4 w-4" /> แก้ไข
            </button>
          </div>
        </div>
      </section>

      {/* ── Tab Navigation — Dark Glass ─────────────────────────────────── */}
      <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/[0.03] backdrop-blur overflow-hidden shadow-[var(--glass-shadow)]">
        <div className="border-b border-[hsl(var(--color-border))] overflow-x-auto">
          <nav className="flex min-w-max">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap
                    ${isActive
                      ? 'border-[hsl(var(--primary))] text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                      : 'border-transparent text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))] hover:bg-white/[0.04]'
                    }
                  `}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--on-surface-variant))]'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'overview' && <OverviewTab room={room} editingRoom={editingRoom} setEditingRoom={setEditingRoom} editForm={editForm} setEditForm={setEditForm} editSaving={editSaving} editError={editError} editSuccess={editSuccess} saveEditRoom={saveEditRoom} accounts={accounts} rules={rules} />}
          {activeTab === 'tenant' && <TenantTab roomNo={room.roomNo} room={room} assigningTenant={assigningTenant} setAssigningTenant={setAssigningTenant} selectedTenantId={selectedTenantId} setSelectedTenantId={setSelectedTenantId} tenantOptions={tenantOptions} assignLoading={assignLoading} assignError={assignError} assignSuccess={assignSuccess} handleAssignTenant={handleAssignTenant} />}
          {activeTab === 'invoices' && <InvoicesTab roomNo={room.roomNo} />}
          {activeTab === 'maintenance' && <MaintenanceTab roomNo={room.roomNo} />}
          {activeTab === 'history' && <HistoryTab roomNo={room.roomNo} />}
        </div>
      </div>
    </main>
  );
}
