'use client';

import { useEffect, useState } from 'react';

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

export default function AdminAuditLogsPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          limit: '100',
          ...(action ? { action } : {}),
        });
        const res = await fetch(`/api/audit-logs?${query.toString()}`, { cache: 'no-store' }).then((r) => r.json());
        if (res.success) setRows(res.data.rows);
        else setError(res.error?.message || 'ไม่สามารถโหลดข้อมูลได้');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [action]);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div>
          <h1 className="text-xl font-semibold text-on-primary">Audit Logs</h1>
          <p className="text-sm text-on-primary/80">Operational trail now loaded from real audit records instead of sample rows.</p>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-[240px] rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Filter by action"
          />
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden anim-fade-in">
        <div className="px-5 py-4 border-b border-outline-variant">
          <div className="text-sm font-semibold text-primary flex items-center gap-2">Activity Trail</div>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface-container text-on-surface-variant mt-1">{rows.length} rows</span>
        </div>
        {error && (
          <div className="mx-5 my-4 flex items-center gap-3 rounded-xl border border-error-container bg-error-container/20 px-4 py-3 text-sm text-on-error-container">
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error}
          </div>
        )}
        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-container">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Timestamp</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">User</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Action</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Entity</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Loading audit logs...</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No audit logs found.</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
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
