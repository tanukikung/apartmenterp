'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ClipboardList, Filter } from 'lucide-react';

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type AuditList = {
  rows: AuditRow[];
  total: number;
};

const ENTITY_TYPES = ['', 'Room', 'Tenant', 'Invoice', 'Payment', 'User', 'Setting', 'Document'];
const PAGE_SIZE = 25;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function actionColor(action: string): string {
  if (action.includes('DELETE') || action.includes('REMOVE')) return 'admin-badge admin-status-error';
  if (action.includes('CREATE') || action.includes('ADD')) return 'admin-badge admin-status-good';
  if (action.includes('UPDATE') || action.includes('EDIT') || action.includes('PATCH')) return 'admin-badge admin-status-warn';
  return 'admin-badge';
}

export default function ReportsAuditPage() {
  const [data, setData] = useState<AuditList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
        ...(entityFilter ? { entityType: entityFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const res = await fetch(`/api/audit-logs?${params.toString()}`, { cache: 'no-store' }).then((r) => r.json());
      if (!res.success) throw new Error((res.error?.message as string | undefined) ?? 'Unable to load audit logs');
      setData(res.data as AuditList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, entityFilter, search]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link href="/admin/reports" className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Reports
          </Link>
          <span className="text-slate-300">/</span>
          <div>
            <h1 className="admin-page-title">Audit Trail</h1>
            <p className="admin-page-subtitle">Full system activity log — all create, update, and delete events.</p>
          </div>
        </div>
        <div className="admin-toolbar">
          <Link href="/admin/audit-logs" className="admin-button">Full Audit Logs →</Link>
        </div>
      </section>

      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            className="border-none bg-transparent text-sm text-slate-700 outline-none"
            value={entityFilter}
            onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
          >
            {ENTITY_TYPES.map((et) => (
              <option key={et} value={et}>{et || 'All types'}</option>
            ))}
          </select>
        </div>
        <input
          className="admin-input w-[240px]"
          placeholder="Search action, entity, user..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <button className="admin-button" onClick={() => void load()}>Refresh</button>
      </section>

      {/* KPI */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="admin-kpi">
          <div className="admin-kpi-label">Total Events</div>
          <div className="admin-kpi-value">{loading ? '...' : (data?.total ?? 0)}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Showing</div>
          <div className="admin-kpi-value">{loading ? '...' : (data?.rows.length ?? 0)}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Page</div>
          <div className="admin-kpi-value">{page} / {totalPages || 1}</div>
        </div>
      </div>

      {/* Table */}
      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-500" /> Audit Events
          </div>
          <span className="admin-badge">{data?.total ?? 0} total</span>
        </div>
        <div className="overflow-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Entity ID</th>
                <th>User</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading audit events...</td></tr>
              ) : !data?.rows.length ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No audit events found.</td></tr>
              ) : (
                data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="text-xs text-slate-700">{new Date(row.createdAt).toLocaleString()}</div>
                      <div className="text-xs text-slate-400">{timeAgo(row.createdAt)}</div>
                    </td>
                    <td><span className={actionColor(row.action)}>{row.action}</span></td>
                    <td><span className="admin-badge">{row.entityType}</span></td>
                    <td className="font-mono text-xs text-slate-500">{row.entityId.slice(0, 8)}…</td>
                    <td>{row.userName || row.userId}</td>
                    <td className="text-xs text-slate-400">{row.ipAddress ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <button
              className="admin-button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              ← Previous
            </button>
            <span className="text-sm text-slate-500">Page {page} of {totalPages}</span>
            <button
              className="admin-button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
