'use client';

import { useEffect, useState } from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Wrench,
  XCircle,
  X,
} from 'lucide-react';
import { useUrlState } from '@/hooks/useUrlState';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';

// ─── Types ──────────────────────────────────────────────────────────────────

type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type Status = 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'DONE' | 'CLOSED';

interface Ticket {
  id: string;
  roomNo: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  assignedStaffId: string | null;
  createdAt: string;
  updatedAt: string;
  tenant: { id: string; firstName: string; lastName: string; phone: string } | null;
  room: { roomNo: string; floorNo: number } | null;
}

interface AdminUser { id: string; username: string; displayName: string; }

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'ต่ำ', MEDIUM: 'ปานกลาง', HIGH: 'สูง', URGENT: 'เร่งด่วน',
};
const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]',
  MEDIUM: 'bg-amber-500/15 text-amber-600 border border-amber-500/30',
  HIGH: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  URGENT: 'bg-red-500/15 text-red-600 border border-red-500/30',
};
const STATUS_LABEL: Record<Status, string> = {
  OPEN: 'รับแจ้ง', IN_PROGRESS: 'กำลังซ่อม', WAITING_PARTS: 'รออะไหล่',
  DONE: 'เสร็จสิ้น', CLOSED: 'ปิดงาน',
};
const STATUS_COLOR: Record<Status, string> = {
  OPEN: 'bg-blue-500/15 text-blue-600 border border-blue-500/30',
  IN_PROGRESS: 'bg-amber-500/15 text-amber-600 border border-amber-500/30',
  WAITING_PARTS: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  DONE: 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30',
  CLOSED: 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border border-[hsl(var(--color-border))]',
};
const ALL_STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE', 'CLOSED'];

// ─── Create Ticket Modal ───────────────────────────────────────────────────────

type RoomOption = { roomNo: string; floorNo: number };

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateTicketModal({ open, onClose, onSuccess }: CreateTicketModalProps) {
  const [roomNo, setRoomNo] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: roomsData } = useQuery({
    queryKey: ['rooms-options'],
    queryFn: async () => {
      const res = await fetch('/api/rooms?pageSize=500');
      const json = await res.json();
      // Only show occupied rooms so admin creates a ticket for an actual tenant
      if (!json.success) return [];
      const all = json.data?.data ?? json.data ?? [];
      return all.filter((r: { roomStatus?: string }) => r.roomStatus === 'OCCUPIED');
    },
    enabled: open,
  });

  function reset() {
    setRoomNo('');
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomNo || !title.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/maintenance/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomNo,
          tenantId: '00000000-0000-0000-0000-000000000000',
          title: title.trim(),
          description: description.trim(),
          priority,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'สร้างไม่ได้');
      reset();
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-[hsl(var(--on-surface))]">แจ้งซ่อมใหม่</h2>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">กรอกรายละเอียดการแจ้งซ่อม</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-[hsl(var(--on-surface-variant))] hover:bg-[hsl(var(--color-surface))]/10 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wide mb-1.5">ห้อง</label>
            <select
              value={roomNo}
              onChange={e => setRoomNo(e.target.value)}
              required
              className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/_0.2)]"
            >
              <option value="" className="bg-[hsl(var(--color-surface))]">— เลือกห้อง —</option>
              {(roomsData as RoomOption[]).map((r: RoomOption) => (
                <option key={r.roomNo} value={r.roomNo} className="bg-[hsl(var(--color-surface))]">
                  {r.roomNo} (ชั้น {r.floorNo})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wide mb-1.5">หัวข้อ</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="เช่น เครื่องปรับอากาศไม่เย็น"
              required
              className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface-variant))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/_0.2)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wide mb-1.5">รายละเอียด</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="อธิบายปัญหาที่พบ..."
              rows={3}
              required
              className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface-variant))] resize-none focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/_0.2)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wide mb-1.5">ความเร่งด่วน</label>
            <div className="grid grid-cols-4 gap-2">
              {(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as Priority[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                    priority === p
                      ? 'bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] border-[hsl(var(--primary))]'
                      : 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border-[hsl(var(--color-border))] hover:border-[hsl(var(--primary))]/40'
                  }`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-400 flex items-center gap-1">
              <XCircle className="w-3 h-3" /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-sm font-medium text-[hsl(var(--on-surface))] hover:bg-[hsl(var(--color-surface))]/80 transition-colors disabled:opacity-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || !roomNo || !title.trim() || !description.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] text-sm font-semibold hover:bg-[hsl(var(--primary))]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? 'กำลังสร้าง...' : 'สร้างรายการ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Glass Card ─────────────────────────────────────────────────────────────

function GlassCard({ children, className = '', hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={[
      'rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]',
      'shadow-[0_4px_16px_rgba(0,0,0,0.08),0_0_0_1px_hsl(var(--color-border))]',
      hover ? 'hover:bg-[hsl(var(--color-surface))] hover:shadow-[0_8px_32px_hsl(var(--color-primary)/0.08),0_0_0_1px_hsl(var(--color-primary)/0.15)] hover:scale-[1.01] transition-all duration-200 cursor-pointer' : '',
      className,
    ].join(' ')}>
      {children}
    </div>
  );
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchTickets(status?: string, q?: string): Promise<{ data: Ticket[]; total: number }> {
  const params = new URLSearchParams();
  if (status && status !== 'ALL') params.set('status', status);
  if (q && q.trim()) params.set('q', q.trim());
  const qs = params.toString();
  const res = await fetch(`/api/admin/maintenance${qs ? `?${qs}` : ''}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'โหลดข้อมูลไม่ได้');
  return json.data;
}

async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch('/api/admin/users');
  const json = await res.json();
  return json.data?.users ?? json.data ?? [];
}

async function updateStatus(ticketId: string, status: Status) {
  const res = await fetch('/api/admin/maintenance/update-status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, status }),
  });
  if (!res.ok) { const j = await res.json(); throw new Error(j.error?.message || 'อัปเดตไม่ได้'); }
}

async function assignStaff(ticketId: string, staffId: string) {
  const res = await fetch('/api/admin/maintenance/assign', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, staffId }),
  });
  if (!res.ok) { const j = await res.json(); throw new Error(j.error?.message || 'มอบหมายไม่ได้'); }
}

async function addComment(ticketId: string, message: string) {
  const res = await fetch('/api/admin/maintenance/comment', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketId, message }),
  });
  if (!res.ok) { const j = await res.json(); throw new Error(j.error?.message || 'เพิ่ม comment ไม่ได้'); }
}

// ─── Component ───────────────────────────────────────────────────────────────

function MaintenancePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useUrlState('status', 'ALL');
  const [search, setSearch] = useUrlState('q', '');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const [searchDebounced, setSearchDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['maintenance', statusFilter, searchDebounced],
    queryFn: () => fetchTickets(statusFilter, searchDebounced),
    refetchInterval: 30000,
  });

  const { data: users = [] } = useQuery({ queryKey: ['admin-users'], queryFn: fetchUsers });

  const mutStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) => updateStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); showToast('อัปเดตสถานะแล้ว'); },
    onError: (e: Error) => showToast('❌ ' + e.message),
  });

  const mutAssign = useMutation({
    mutationFn: ({ id, staffId }: { id: string; staffId: string }) => assignStaff(id, staffId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); showToast('มอบหมายงานแล้ว'); },
    onError: (e: Error) => showToast('❌ ' + e.message),
  });

  const mutComment = useMutation({
    mutationFn: ({ id, msg }: { id: string; msg: string }) => addComment(id, msg),
    onSuccess: () => { setComment(''); showToast('เพิ่ม comment แล้ว'); },
    onError: (e: Error) => showToast('❌ ' + e.message),
  });

  const tickets = data?.data ?? [];
  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const urgentCount = tickets.filter(t => t.priority === 'URGENT').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] text-[hsl(var(--on-surface))] px-4 py-2 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.12)] text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-[hsl(var(--primary))] px-6 py-5 shadow-[0_8px_32px_hsl(var(--color-primary)/0.2)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--color-surface)/0.15)] ring-1 ring-[hsl(var(--color-border))] shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
              <Wrench className="h-5 w-5 text-[hsl(var(--on-primary))]" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--on-primary))]">แจ้งซ่อม</h1>
              <p className="text-xs text-[hsl(var(--on-primary)/0.7)] mt-0.5">จัดการคำขอซ่อมบำรุงจากผู้เช่า</p>
            </div>
          </div>
          <button onClick={() => refetch()} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.15)] px-4 py-2 text-sm font-medium text-[hsl(var(--on-primary))] shadow-sm transition-all hover:bg-[hsl(var(--color-surface)/0.25)] active:scale-95">
            <RefreshCw className="h-4 w-4" /> รีเฟรช
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.15)] px-4 py-2 text-sm font-medium text-[hsl(var(--on-primary))] shadow-sm transition-all hover:bg-[hsl(var(--color-surface)/0.25)] active:scale-95"
          >
            <Plus className="h-4 w-4" /> แจ้งซ่อมใหม่
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <GlassCard className="p-5" hover>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
              <Clock className="h-5 w-5 text-[hsl(var(--primary))]" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--on-surface))]">{openCount}</p>
              <p className="text-xs font-medium text-[hsl(var(--on-surface-variant))]">รอดำเนินการ</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 shadow-[0_4px_16px_rgba(239,68,68,0.2)]">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{urgentCount}</p>
              <p className="text-xs font-medium text-[hsl(var(--on-surface-variant))]">เร่งด่วน</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 shadow-[0_4px_16px_rgba(251,191,36,0.2)]">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--on-surface))]">{tickets.filter(t => t.status === 'IN_PROGRESS').length}</p>
              <p className="text-xs font-medium text-[hsl(var(--on-surface-variant))]">กำลังซ่อม</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5" hover>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_4px_16px_rgba(34,197,94,0.2)]">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-[hsl(var(--on-surface))]">{tickets.filter(t => t.status === 'DONE' || t.status === 'CLOSED').length}</p>
              <p className="text-xs font-medium text-[hsl(var(--on-surface-variant))]">เสร็จสิ้น/ปิดงาน</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 flex-wrap">
          {(['ALL', ...ALL_STATUSES] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all active:scale-95 ${
                statusFilter === s
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--on-primary))] border-[hsl(var(--primary))] shadow-[0_1px_3px_rgba(0,0,0,0.5)]'
                  : 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-surface))]'
              }`}
            >
              {s === 'ALL' ? 'ทั้งหมด' : STATUS_LABEL[s as Status]}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาห้อง, ผู้เช่า, หัวข้อ..."
            className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] py-2.5 pl-9 pr-3 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface-variant))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/_0.2)]"
          />
        </div>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket list */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            <SkeletonTable rows={6} />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={<Wrench className="h-7 w-7" />}
              title="ไม่พบรายการแจ้งซ่อม"
              description={searchDebounced || statusFilter !== 'ALL' ? 'ลองเปลี่ยนตัวกรองหรือล้างการค้นหา' : 'ยังไม่มีการแจ้งซ่อมในระบบ'}
            />
          ) : tickets.map(ticket => (
            <GlassCard key={ticket.id} hover className={`p-4 ${selected?.id === ticket.id ? 'ring-2 ring-indigo-500/50 shadow-[0_0_0_1px_rgba(99,102,241,0.3),0_12px_40px_rgba(0,0,0,0.5)]' : ''}`}>
              <div
                onClick={() => setSelected(ticket)}
                className="cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[ticket.priority]}`}>
                        {PRIORITY_LABEL[ticket.priority]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[ticket.status]}`}>
                        {STATUS_LABEL[ticket.status]}
                      </span>
                    </div>
                    <p className="font-semibold text-[hsl(var(--on-surface))] truncate">{ticket.title}</p>
                    <p className="text-sm text-[hsl(var(--on-surface-variant))] truncate mt-0.5">{ticket.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[hsl(var(--on-surface-variant))]">
                      <span className="flex items-center gap-1">ห้อง {ticket.roomNo}</span>
                      {ticket.tenant && (
                        <span className="flex items-center gap-1">
                          {ticket.tenant.firstName} {ticket.tenant.lastName}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-[hsl(var(--on-surface-variant))] whitespace-nowrap">
                    {new Date(ticket.createdAt).toLocaleDateString('th-TH')}
                  </span>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-1">
          {selected ? (
            <GlassCard className="p-5 space-y-5 sticky top-6">
              <div className="flex items-start justify-between">
                <h2 className="font-bold text-[hsl(var(--on-surface))] text-lg leading-tight pr-2">{selected.title}</h2>
                <button onClick={() => setSelected(null)} className="text-[hsl(var(--on-surface-variant))] hover:text-[hsl(var(--on-surface))] transition-colors ml-2 shrink-0">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-[hsl(var(--on-surface-variant))]">{selected.description}</p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[hsl(var(--on-surface-variant))]">ห้อง</span><span className="font-medium text-[hsl(var(--on-surface))]">{selected.roomNo}</span></div>
                {selected.tenant && (
                  <div className="flex justify-between"><span className="text-[hsl(var(--on-surface-variant))]">ผู้เช่า</span>
                    <span className="font-medium text-[hsl(var(--on-surface))]">{selected.tenant.firstName} {selected.tenant.lastName}</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-[hsl(var(--on-surface-variant))]">ความเร่งด่วน</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[selected.priority]}`}>
                    {PRIORITY_LABEL[selected.priority]}
                  </span>
                </div>
              </div>

              {/* Change status */}
              <div>
                <label className="text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wide block mb-1.5">เปลี่ยนสถานะ</label>
                <select
                  value={selected.status}
                  onChange={e => mutStatus.mutate({ id: selected.id, status: e.target.value as Status })}
                  disabled={mutStatus.isPending}
                  className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/_0.2)]"
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s} className="bg-[hsl(var(--color-surface))]">{STATUS_LABEL[s]}</option>)}
                </select>
              </div>

              {/* Assign staff */}
              <div>
                <label className="text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wide block mb-1.5">มอบหมายให้</label>
                <select
                  value={selected.assignedStaffId ?? ''}
                  onChange={e => { if (e.target.value) mutAssign.mutate({ id: selected.id, staffId: e.target.value }); }}
                  disabled={mutAssign.isPending}
                  className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/_0.2)]"
                >
                  <option value="" className="bg-[hsl(var(--color-surface))]">— ยังไม่มอบหมาย —</option>
                  {users.map((u: AdminUser) => <option key={u.id} value={u.id} className="bg-[hsl(var(--color-surface))]">{u.displayName} (@{u.username})</option>)}
                </select>
              </div>

              {/* Add comment */}
              <div>
                <label className="text-xs font-medium text-[hsl(var(--on-surface-variant))] uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="w-3 h-3" /> เพิ่ม comment
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder="บันทึกหมายเหตุ..."
                  className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2.5 text-sm text-[hsl(var(--on-surface))] placeholder:text-[hsl(var(--on-surface-variant))] resize-none focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-primary)/_0.2)]"
                />
                <button
                  onClick={() => { if (comment.trim()) mutComment.mutate({ id: selected.id, msg: comment }); }}
                  disabled={!comment.trim() || mutComment.isPending}
                  className="mt-2 w-full bg-[hsl(var(--primary))] border border-[hsl(var(--color-primary)/_0.3)] text-[hsl(var(--on-primary))] text-sm py-2.5 rounded-xl hover:bg-[hsl(var(--color-primary)/_0.15)] transition-colors disabled:opacity-40 active:scale-95"
                >
                  {mutComment.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'บันทึก comment'}
                </button>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] mb-4">
                <Plus className="w-6 h-6 text-[hsl(var(--on-surface-variant))]" />
              </div>
              <p className="text-sm text-[hsl(var(--on-surface-variant))]">เลือกรายการซ้ายเพื่อดูรายละเอียด</p>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Create ticket modal */}
      <CreateTicketModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => { qc.invalidateQueries({ queryKey: ['maintenance'] }); showToast('สร้างรายการแจ้งซ่อมแล้ว'); }}
      />
    </div>
  );
}

export default function Page() {
  return <ClientOnly><MaintenancePage /></ClientOnly>;
}
