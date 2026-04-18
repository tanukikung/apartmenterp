'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { Wrench, RefreshCw, User, Home, AlertTriangle, Clock, CheckCircle2, XCircle, Loader2, MessageSquare } from 'lucide-react';

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
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  URGENT: 'bg-red-100 text-red-800',
};
const STATUS_LABEL: Record<Status, string> = {
  OPEN: 'รับแจ้ง', IN_PROGRESS: 'กำลังซ่อม', WAITING_PARTS: 'รออะไหล่',
  DONE: 'เสร็จสิ้น', CLOSED: 'ปิดงาน',
};
const STATUS_COLOR: Record<Status, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  WAITING_PARTS: 'bg-purple-100 text-purple-800',
  DONE: 'bg-green-100 text-green-800',
  CLOSED: 'bg-gray-100 text-gray-600',
};
const ALL_STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE', 'CLOSED'];

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchTickets(status?: string): Promise<{ data: Ticket[]; total: number }> {
  const q = status && status !== 'ALL' ? `?status=${status}` : '';
  const res = await fetch(`/api/admin/maintenance${q}`);
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
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [comment, setComment] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['maintenance', statusFilter],
    queryFn: () => fetchTickets(statusFilter),
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
  const total = data?.total ?? 0;
  const openCount = tickets.filter(t => t.status === 'OPEN').length;
  const urgentCount = tickets.filter(t => t.priority === 'URGENT').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2 rounded shadow-lg text-sm">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wrench className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">แจ้งซ่อม</h1>
            <p className="text-sm text-gray-500">จัดการคำขอซ่อมบำรุงจากผู้เช่า</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 px-3 py-2 text-sm border rounded hover:bg-gray-50">
          <RefreshCw className="w-4 h-4" /> รีเฟรช
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <Clock className="w-8 h-8 text-blue-500" />
          <div><p className="text-2xl font-bold">{openCount}</p><p className="text-sm text-gray-500">รอดำเนินการ</p></div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <div><p className="text-2xl font-bold">{urgentCount}</p><p className="text-sm text-gray-500">เร่งด่วน</p></div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
          <div><p className="text-2xl font-bold">{total}</p><p className="text-sm text-gray-500">ทั้งหมด</p></div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(['ALL', ...ALL_STATUSES] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
              statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {s === 'ALL' ? 'ทั้งหมด' : STATUS_LABEL[s as Status]}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket list */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
          ) : tickets.length === 0 ? (
            <div className="bg-white border rounded-lg p-12 text-center text-gray-400">
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>ไม่พบรายการแจ้งซ่อม</p>
            </div>
          ) : tickets.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => setSelected(ticket)}
              className={`bg-white border rounded-lg p-4 cursor-pointer hover:shadow-md transition ${
                selected?.id === ticket.id ? 'border-blue-500 shadow-md' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[ticket.priority]}`}>
                      {PRIORITY_LABEL[ticket.priority]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[ticket.status]}`}>
                      {STATUS_LABEL[ticket.status]}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 truncate">{ticket.title}</p>
                  <p className="text-sm text-gray-500 truncate">{ticket.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Home className="w-3 h-3" /> ห้อง {ticket.roomNo}</span>
                    {ticket.tenant && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {ticket.tenant.firstName} {ticket.tenant.lastName}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(ticket.createdAt).toLocaleDateString('th-TH')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-1">
          {selected ? (
            <div className="bg-white border rounded-lg p-5 space-y-5 sticky top-6">
              <div className="flex items-start justify-between">
                <h2 className="font-bold text-gray-900 text-lg leading-tight">{selected.title}</h2>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 ml-2">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-gray-600">{selected.description}</p>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">ห้อง</span><span className="font-medium">{selected.roomNo}</span></div>
                {selected.tenant && (
                  <div className="flex justify-between"><span className="text-gray-500">ผู้เช่า</span>
                    <span className="font-medium">{selected.tenant.firstName} {selected.tenant.lastName}</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-gray-500">ความเร่งด่วน</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[selected.priority]}`}>
                    {PRIORITY_LABEL[selected.priority]}
                  </span>
                </div>
              </div>

              {/* Change status */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">เปลี่ยนสถานะ</label>
                <select
                  value={selected.status}
                  onChange={e => mutStatus.mutate({ id: selected.id, status: e.target.value as Status })}
                  disabled={mutStatus.isPending}
                  className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>

              {/* Assign staff */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">มอบหมายให้</label>
                <select
                  value={selected.assignedStaffId ?? ''}
                  onChange={e => { if (e.target.value) mutAssign.mutate({ id: selected.id, staffId: e.target.value }); }}
                  disabled={mutAssign.isPending}
                  className="mt-1 w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— ยังไม่มอบหมาย —</option>
                  {users.map((u: AdminUser) => <option key={u.id} value={u.id}>{u.displayName} (@{u.username})</option>)}
                </select>
              </div>

              {/* Add comment */}
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> เพิ่ม comment
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder="บันทึกหมายเหตุ..."
                  className="mt-1 w-full border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => { if (comment.trim()) mutComment.mutate({ id: selected.id, msg: comment }); }}
                  disabled={!comment.trim() || mutComment.isPending}
                  className="mt-2 w-full bg-blue-600 text-white text-sm py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {mutComment.isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'บันทึก comment'}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg p-12 text-center text-gray-400">
              <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">เลือกรายการซ้ายเพื่อดูรายละเอียด</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <ClientOnly><MaintenancePage /></ClientOnly>;
}
