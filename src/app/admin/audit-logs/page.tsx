'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { ClipboardList, Search } from 'lucide-react';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useUrlState } from '@/hooks/useUrlState';

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  details?: unknown;
  createdAt: string;
};

async function fetchAuditLogs(action: string, q: string): Promise<{ rows: AuditRow[] }> {
  const query = new URLSearchParams({
    limit: '100',
    ...(action ? { action } : {}),
    ...(q ? { q } : {}),
  });
  const res = await fetch(`/api/audit-logs?${query.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

export default function AdminAuditLogsPage() {
  const [action, setAction] = useUrlState('action', '');
  const [search, setSearch] = useUrlState('q', '');
  const [searchDebounced, setSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = useQuery<{ rows: AuditRow[] }>({
    queryKey: ['audit-logs', action, searchDebounced],
    queryFn: () => fetchAuditLogs(action, searchDebounced),
  });

  const rows: AuditRow[] = data?.rows ?? [];

  return (
    <main className="space-y-6">
      {/* Page header */}
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--color-border))]  px-6 py-5 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div className="absolute inset-0 pointer-events-none" />
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))]">
              <ClipboardList className="h-5 w-5 text-primary" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[hsl(var(--card-foreground))]">บันทึกกิจกรรม</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))]">รายการกิจกรรมจากระบบจริงแทนข้อมูลตัวอย่าง</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-5">
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-[220px] rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              placeholder="กรองตามการดำเนินการ"
              aria-label="กรองตามการดำเนินการ"
            />
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]/50" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาผู้ใช้, เอนทิตี, หรือ ID..."
                aria-label="ค้นหา"
                className="w-full rounded-xl border border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))] py-2.5 pl-9 pr-4 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-2xl border border-[hsl(var([hsl(var(--color-border))]))]  overflow-hidden shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var([hsl(var(--color-border))]))]">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">รายการกิจกรรม</div>
          </div>
          <span className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-2.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--on-surface-variant))]">{rows.length} รายการ</span>
        </div>

        {error && (
          <div className="mx-5 my-4 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}

        {isLoading ? (
          <div className="p-5">
            <SkeletonTable rows={8} />
          </div>
        ) : !rows.length ? (
          <EmptyState
            icon={<ClipboardList className="h-7 w-7" />}
            title="ไม่พบบันทึกกิจกรรม"
            description={searchDebounced || action ? 'ลองปรับคำค้นหาหรือล้างตัวกรองเพื่อดูรายการทั้งหมด' : 'ยังไม่มีบันทึกกิจกรรมในระบบ'}
            action={(searchDebounced || action) ? { label: 'ล้างตัวกรอง', onClick: () => { setSearch(''); setAction(''); } } : undefined}
          />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[hsl(var([hsl(var(--color-border))]))] bg-[hsl(var(--card))]">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เวลา</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">ผู้ใช้</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">การดำเนินการ</th>
                  <th className="hidden md:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">เอนทิตี</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface-variant))]">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[hsl(var([hsl(var(--color-border))]))] hover:bg-[hsl(var(--card))]/50 transition-colors">
                    <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))] text-xs"><ClientOnly fallback="-">{new Date(row.createdAt).toLocaleString('th-TH')}</ClientOnly></td>
                    <td className="px-4 py-3 text-[hsl(var(--card-foreground))]">{row.userName || row.userId}</td>
                    <td>
                      <span className="rounded-full border border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--primary))]">{row.action}</span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-[hsl(var(--on-surface-variant))]">{row.entityType}: {row.entityId}</td>
                    <td className="hidden lg:table-cell max-w-[420px] truncate px-4 py-3 text-[hsl(var(--on-surface-variant))] text-xs">{row.details ? JSON.stringify(row.details) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
