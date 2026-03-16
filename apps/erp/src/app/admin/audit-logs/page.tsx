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
  const [action, setAction] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          limit: '100',
          ...(action ? { action } : {}),
        });
        const res = await fetch(`/api/audit-logs?${query.toString()}`, { cache: 'no-store' }).then((r) => r.json());
        if (res.success) setRows(res.data.rows);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [action]);

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Audit Logs</h1>
          <p className="admin-page-subtitle">Operational trail now loaded from real audit records instead of sample rows.</p>
        </div>
        <div className="admin-toolbar">
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="admin-input w-[240px]"
            placeholder="Filter by action"
          />
        </div>
      </section>

      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title">Activity Trail</div>
          <span className="admin-badge">{rows.length} rows</span>
        </div>
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
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
