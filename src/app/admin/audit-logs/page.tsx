'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClientOnly } from '@/components/ui/ClientOnly';

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

async function fetchAuditLogs(action: string): Promise<{ rows: AuditRow[] }> {
  const query = new URLSearchParams({
    limit: '100',
    ...(action ? { action } : {}),
  });
  const res = await fetch(`/api/audit-logs?${query.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed');
  return json.data;
}

export default function AdminAuditLogsPage() {
  const [action, setAction] = useState('');

  const { data, isLoading, error } = useQuery<{ rows: AuditRow[] }>({
    queryKey: ['audit-logs', action],
    queryFn: () => fetchAuditLogs(action),
  });

  const rows: AuditRow[] = data?.rows ?? [];

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-[var(--outline-variant)]/10 bg-gradient-to-br from-[var(--primary-container)] to-[var(--primary)] px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-[var(--on-primary)]">บันทึกกิจกรรม</h1>
          <p className="text-sm text-[var(--on-primary)]/80">รายการกิจกรรมจากระบบจริงแทนข้อมูลตัวอย่าง</p>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-[240px] rounded-xl border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[var(--on-surface)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
            placeholder="กรองตามการดำเนินการ"
          />
        </div>
      </section>

      <section className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden anim-fade-in">
        <div className="px-5 py-4 border-b border-[var(--outline-variant)]">
          <div className="text-sm font-semibold text-[var(--primary)] flex items-center gap-2">รายการกิจกรรม</div>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-[var(--surface-container)] text-[var(--on-surface-variant)] mt-1">{rows.length} รายการ</span>
        </div>
        {error && (
          <div className="mx-5 my-4 flex items-center gap-3 rounded-xl border border-[var(--error-container)] bg-[var(--error-container)]/20 px-4 py-3 text-sm text-[var(--on-error-container)]">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}
        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[var(--surface-container)]">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">เวลา</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">ผู้ใช้</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">การดำเนินการ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">เอนทิตี</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[var(--on-surface-variant)]">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">กำลังโหลดบันทึกกิจกรรม...</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">ไม่พบบันทึกกิจกรรม</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td><ClientOnly fallback="-">{new Date(row.createdAt).toLocaleString('th-TH')}</ClientOnly></td>
                    <td>{row.userName || row.userId}</td>
                    <td>{row.action}</td>
                    <td>{row.entityType}:{' '}{row.entityId}</td>
                    <td className="max-w-[420px] truncate">{row.details ? JSON.stringify(row.details) : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
