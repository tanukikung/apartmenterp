'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientOnly } from '@/components/ui/ClientOnly';
import {
  Bell,
  BellOff,
  Clock,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useUrlState } from '@/hooks/useUrlState';
import { useNotificationStream } from '@/hooks/useNotificationStream';
import { motion } from 'framer-motion';

type NotificationRow = {
  id: string;
  type: string;
  roomNo: string;
  tenantId: string | null;
  adminId: string | null;
  contractId: string | null;
  scheduledAt: string;
  sentAt: string | null;
  status: string;
  content: string;
  lineMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

async function fetchNotifications(
  unreadOnly: boolean
): Promise<{ notifications: NotificationRow[]; unreadCount: number; limit: number }> {
  const query = new URLSearchParams({ limit: '100', unreadOnly: String(unreadOnly) });
  const res = await fetch(`/api/notifications?${query.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; bg: string; text: string; border: string }> = {
  PENDING: { label: 'รอส่ง', icon: Clock, bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  SENT: { label: 'ส่งแล้ว', icon: Send, bg: 'rgba(52,211,153,0.15)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },
  FAILED: { label: 'ล้มเหลว', icon: XCircle, bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.3)' },
  CANCELLED: { label: 'ยกเลิก', icon: BellOff, bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: 'rgba(148,163,184,0.2)' },
};

const TYPE_CONFIG: Record<string, { label: string }> = {
  INVOICE_REMINDER: { label: 'แจ้งเตือนใบแจ้งหนี้' },
  PAYMENT_REMINDER: { label: 'แจ้งเตือนการชำระเงิน' },
  NOTICE: { label: 'ประกาศ' },
  CUSTOM: { label: 'ข้อความทั่วไป' },
};

export default function AdminNotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useUrlState('unread', 'false');
  const [search, setSearch] = useUrlState('q', '');
  const [searchDebounced, setSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => fetchNotifications(unreadOnly === 'true'),
    refetchInterval: 10_000,
  });

  const queryClient = useQueryClient();

  useNotificationStream(
    useCallback((n) => {
      queryClient.setQueryData(['notifications', unreadOnly], (old: typeof data) => {
        if (!old) return old;
        const notificationRow: NotificationRow = {
          id: n.id,
          type: n.type,
          roomNo: n.roomNo,
          status: n.status,
          content: n.content,
          createdAt: n.createdAt,
          tenantId: n.tenantId,
          adminId: n.adminId,
          contractId: n.contractId,
          scheduledAt: n.scheduledAt ?? '',
          sentAt: n.sentAt,
          lineMessageId: n.lineMessageId,
          errorMessage: n.errorMessage,
        };
        return {
          ...old,
          notifications: [notificationRow, ...(old.notifications ?? [])].slice(0, 100),
          unreadCount: old.unreadCount + (n.status === 'PENDING' ? 1 : 0),
        };
      });
    }, [queryClient, unreadOnly])
  );

  const rows: NotificationRow[] = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const filtered = searchDebounced
    ? rows.filter(
        (r) =>
          r.content.includes(searchDebounced) ||
          r.roomNo.includes(searchDebounced) ||
          r.id.includes(searchDebounced)
      )
    : rows;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* ── Header ── */}
      <section className="relative overflow-hidden rounded-xl border border-[hsl(var(--glass-border))] glass-card px-6 py-5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">การแจ้งเตือน</h1>
            <p className="text-sm text-[hsl(var(--on-surface-variant))] mt-0.5">
              รายการการแจ้งเตือนที่จะส่งหรือส่งแล้ว
              {unreadCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                  {unreadCount} รอดำเนินการ
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-[hsl(var(--glass-border))] glass-card px-3 py-2 text-sm text-[hsl(var(--card-foreground))]">
              <input
                type="checkbox"
                checked={unreadOnly === 'true'}
                onChange={(e) => setUnreadOnly(e.target.checked ? 'true' : 'false')}
                className="h-4 w-4 rounded border-[hsl(var(--glass-border))] accent-[hsl(var(--primary))]"
              />
              เฉพาะที่รอส่ง
            </label>
            <button
              onClick={() => void refetch()}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-white/5 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
        <div className="relative mt-4 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาข้อความ, ห้อง, หรือ ID..."
            className="w-full rounded-xl border border-[hsl(var(--glass-border))] glass-card py-2.5 pl-9 pr-4 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
          />
        </div>
      </section>

      {/* ── Table ── */}
      <section className="rounded-xl border border-[hsl(var(--glass-border))] glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--glass-border))]" style={{ background: 'hsl(var(--card))' }}>
          <div className="text-sm font-semibold text-[hsl(var(--primary))] flex items-center gap-2">
            <Bell className="h-4 w-4" />
            รายการแจ้งเตือน
          </div>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold glass-card text-[hsl(var(--on-surface-variant))] mt-1">
            {filtered.length} รายการ
          </span>
        </div>
        {error && (
          <div className="mx-5 my-4 flex items-center gap-3 rounded-xl border border-red-500/30 px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
            <XCircle className="h-4 w-4 shrink-0" />
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={8} /></div>
        ) : !filtered.length ? (
          <EmptyState
            icon={<BellOff className="h-7 w-7" />}
            title="ไม่พบการแจ้งเตือน"
            description={searchDebounced ? 'ลองปรับคำค้นหา' : 'ยังไม่มีการแจ้งเตือนในระบบ'}
            action={searchDebounced ? { label: 'ล้างค้นหา', onClick: () => setSearch('') } : undefined}
          />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[hsl(var(--glass-border))]" style={{ background: 'hsl(var(--card))' }}>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ประเภท</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ห้อง</th>
                  <th className="hidden md:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ข้อความ</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">กำหนดส่ง</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ส่งเมื่อ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เวลาสร้าง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--glass-border))]">
                {filtered.map((row) => {
                  const statusCfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.PENDING;
                  const typeCfg = TYPE_CONFIG[row.type] ?? { label: row.type };
                  const StatusIcon = statusCfg.icon;
                  return (
                    <tr key={row.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium`}
                          style={{ background: statusCfg.bg, color: statusCfg.text, borderColor: statusCfg.border }}>
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--card-foreground))]">{typeCfg.label}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--card-foreground))]">{row.roomNo}</td>
                      <td className="hidden md:table-cell max-w-[300px] truncate px-4 py-3 text-[hsl(var(--on-surface-variant))]">{row.content}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-[hsl(var(--on-surface-variant))]">
                        <ClientOnly fallback="-">
                          {row.scheduledAt ? new Date(row.scheduledAt).toLocaleString('th-TH') : '-'}
                        </ClientOnly>
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-[hsl(var(--on-surface-variant))]">
                        <ClientOnly fallback="-">
                          {row.sentAt ? new Date(row.sentAt).toLocaleString('th-TH') : '-'}
                        </ClientOnly>
                      </td>
                      <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">
                        <ClientOnly fallback="-">
                          {new Date(row.createdAt).toLocaleString('th-TH')}
                        </ClientOnly>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </motion.div>
  );
}
