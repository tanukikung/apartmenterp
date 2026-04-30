'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, UserCheck, X, Clock, UserPlus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type RegistrationRequest = {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedAt: string | null;
  rejectReason: string | null;
  reviewedById: string | null;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadgeClass(status: RegistrationRequest['status']): string {
  if (status === 'APPROVED') return 'rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400';
  if (status === 'REJECTED') return 'rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-400';
  return 'rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400';
}

function statusLabel(status: RegistrationRequest['status']): string {
  if (status === 'APPROVED') return 'อนุมัติแล้ว';
  if (status === 'REJECTED') return 'ปฏิเสธแล้ว';
  return 'รอดำเนินการ';
}

export default function StaffRequestsPage() {
  const queryClient = useQueryClient();

  const {
    isLoading,
    error,
    data: requests,
  } = useQuery<RegistrationRequest[]>({
    queryKey: ['staff-registration-requests'],
    queryFn: async () => {
      const res = await fetch('/api/admin/registration-requests?status=PENDING', {
        cache: 'no-store',
      });
      const json = await res.json() as { success: boolean; data?: RegistrationRequest[]; error?: { message?: string } };
      if (!json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดรายการคำขอ');
      }
      return json.data ?? [];
    },
    retry: false,
  });

  const [pendingAction, setPendingAction] = useState<{
    request: RegistrationRequest;
    action: 'approve' | 'reject';
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAction = useCallback(async () => {
    if (!pendingAction) return;
    setActionLoading(true);
    setActionError(null);

    const { request, action } = pendingAction;
    const endpoint =
      action === 'approve'
        ? `/api/admin/registration-requests/${request.id}/approve`
        : `/api/admin/registration-requests/${request.id}/reject`;

    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const json = await res.json() as { success: boolean; error?: { message?: string } };
      if (!json.success) {
        throw new Error(json.error?.message ?? `ไม่สามารถ${action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'}คำขอ`);
      }
      setPendingAction(null);
      await queryClient.invalidateQueries({ queryKey: ['staff-registration-requests'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setActionLoading(false);
    }
  }, [pendingAction, queryClient]);

  const openApprove = (request: RegistrationRequest) =>
    setPendingAction({ request, action: 'approve' });
  const openReject = (request: RegistrationRequest) =>
    setPendingAction({ request, action: 'reject' });

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[hsl(225,25%,6%)] via-[hsl(225,25%,8%)] to-[hsl(225,25%,6%)] px-6 py-5 shadow-xl shadow-black/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.15),_transparent_60%)]" />
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Link href="/admin/settings" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-all hover:bg-white/10 hover:scale-105 active:scale-[0.98]">
            <ArrowLeft className="h-4 w-4 text-white/70" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-white">คำขอลงทะเบียนพนักงาน</h1>
            <p className="text-sm text-white/50">ตรวจสอบและอนุมัติหรือปฏิเสธคำขอสมัครพนักงานใหม่</p>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-400">
          {error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล'}
        </div>
      )}

      {/* Requests table */}
      <div className="rounded-2xl border border-white/10 bg-[hsl(225,25%,6%)] shadow-xl shadow-black/20 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-white/40" />
            <div className="text-sm font-semibold text-white">รายการคำขอ</div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-white/60">
            {isLoading ? '...' : requests?.length ?? 0} คำขอ
          </span>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">ชื่อผู้ใช้</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">ชื่อที่แสดง</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">อีเมล</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">สถานะ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30">วันที่ส่งคำขอ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white/30 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3"><div className="h-4 w-28 animate-pulse rounded bg-white/5" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-white/5" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-36 animate-pulse rounded bg-white/5" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-white/5" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-white/5" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-white/5 ml-auto" /></td>
                  </tr>
                ))
              ) : !requests || requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
                        <UserPlus className="h-7 w-7 text-white/30" />
                      </div>
                      <div>
                        <p className="font-medium text-white/70">ไม่มีคำขอรอดำเนินการ</p>
                        <p className="text-sm text-white/30 mt-1">คำขอลงทะเบียนพนักงานใหม่จะปรากฏที่นี่</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {req.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-white/80">{req.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white/50">{req.displayName}</td>
                    <td className="px-4 py-3 text-white/50">{req.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={statusBadgeClass(req.status)}>
                        {req.status === 'PENDING' && <Clock className="h-3 w-3" />}
                        {req.status === 'APPROVED' && <Check className="h-3 w-3" />}
                        {req.status === 'REJECTED' && <X className="h-3 w-3" />}
                        {statusLabel(req.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/50">{formatDate(req.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {req.status === 'PENDING' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openApprove(req)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:scale-105 active:scale-[0.98] transition-all"
                          >
                            <Check className="h-3.5 w-3.5" />
                            อนุมัติ
                          </button>
                          <button
                            onClick={() => openReject(req)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 hover:scale-105 active:scale-[0.98] transition-all"
                          >
                            <X className="h-3.5 w-3.5" />
                            ปฏิเสธ
                          </button>
                        </div>
                      )}
                      {req.status === 'REJECTED' && req.rejectReason && (
                        <span className="text-xs text-white/30 italic">
                          สาเหตุ: {req.rejectReason}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Dialog */}
      {pendingAction && (
        <ConfirmDialog
          open={true}
          title={
            pendingAction.action === 'approve'
              ? `อนุมัติคำขอของ ${pendingAction.request.username}`
              : `ปฏิเสธคำขอของ ${pendingAction.request.username}`
          }
          description={
            pendingAction.action === 'approve'
              ? `ยืนยันการอนุมัติให้ "${pendingAction.request.displayName}" เป็นพนักงาน`
              : `ยืนยันการปฏิเสธคำขอของ "${pendingAction.request.displayName}"`
          }
          confirmLabel={pendingAction.action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'}
          dangerous={pendingAction.action === 'reject'}
          loading={actionLoading}
          onConfirm={handleAction}
          onCancel={() => {
            setPendingAction(null);
            setActionError(null);
          }}
        />
      )}

      {/* Action error */}
      {actionError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-400">
          {actionError}
        </div>
      )}
    </main>
  );
}
