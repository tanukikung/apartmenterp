'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
  XCircle,
} from 'lucide-react';

type BatchStatus = 'UPLOADED' | 'VALIDATED' | 'IMPORTED' | 'FAILED';

type ImportBatch = {
  id: string;
  uploadedFileId: string | null;
  sourceFilename: string;
  templateVersion: string | null;
  status: BatchStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  createdAt: string;
  importedAt: string | null;
  billingCycle: {
    id: string;
    year: number;
    month: number;
    status: string;
    building: {
      id: string;
      name: string;
    } | null;
  } | null;
};

const STATUS_OPTIONS: Array<BatchStatus | 'ALL'> = ['ALL', 'UPLOADED', 'VALIDATED', 'IMPORTED', 'FAILED'];

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function monthLabel(month: number, year: number) {
  return `${String(month).padStart(2, '0')}/${year}`;
}

function statusBadge(status: BatchStatus) {
  if (status === 'IMPORTED') return 'admin-badge admin-status-good';
  if (status === 'FAILED') return 'admin-badge admin-status-bad';
  if (status === 'VALIDATED') return 'admin-badge admin-status-warn';
  return 'admin-badge';
}

export default function BillingBatchesPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BatchStatus | 'ALL'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (status !== 'ALL') params.set('status', status);

      const response = await fetch(`/api/billing/import/batches?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to load import batches');
      }

      const rows = (json.data?.batches ?? []) as ImportBatch[];
      setBatches(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load import batches');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return batches;
    return batches.filter((batch) => {
      const cycle = batch.billingCycle ? monthLabel(batch.billingCycle.month, batch.billingCycle.year) : '';
      return (
        batch.sourceFilename.toLowerCase().includes(needle) ||
        batch.id.toLowerCase().includes(needle) ||
        cycle.toLowerCase().includes(needle) ||
        (batch.billingCycle?.building?.name ?? '').toLowerCase().includes(needle)
      );
    });
  }, [batches, search]);

  const stats = useMemo(() => {
    return {
      total: batches.length,
      imported: batches.filter((batch) => batch.status === 'IMPORTED').length,
      needsReview: batches.filter((batch) => batch.warningRows > 0 || batch.invalidRows > 0).length,
      latestImportedAt: [...batches]
        .filter((batch) => batch.importedAt)
        .sort((a, b) => (new Date(b.importedAt || 0).getTime() - new Date(a.importedAt || 0).getTime()))[0]
        ?.importedAt ?? null,
    };
  }, [batches]);

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Billing Import Batches</h1>
          <p className="admin-page-subtitle">
            Every workbook is staged here first, validated row-by-row, and then committed into live billing records.
          </p>
        </div>
        <div className="admin-toolbar">
          <Link href="/admin/billing/import" className="admin-button admin-button-primary">
            New Import
          </Link>
          <button onClick={() => void load()} className="admin-button flex items-center gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-kpi">
          <div className="admin-kpi-label">Total Batches</div>
          <div className="admin-kpi-value">{stats.total}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Imported</div>
          <div className="admin-kpi-value text-emerald-600">{stats.imported}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Needs Review</div>
          <div className="admin-kpi-value text-amber-600">{stats.needsReview}</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Latest Import</div>
          <div className="mt-2 text-sm font-medium text-slate-700">{formatDate(stats.latestImportedAt)}</div>
        </div>
      </section>

      <section className="admin-card overflow-hidden">
        <div className="admin-card-header">
          <div className="admin-card-title">Batch Library</div>
          <div className="admin-toolbar">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search batch, filename, cycle..."
                className="admin-input pl-9"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as BatchStatus | 'ALL')}
              className="admin-select"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'ALL' ? 'All statuses' : option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading import batches...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FileSpreadsheet className="h-10 w-10 text-slate-300" />
            <div>
              <div className="font-semibold text-slate-700">No import batches found</div>
              <div className="text-sm text-slate-400">Upload the first workbook to start staging monthly billing.</div>
            </div>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Cycle</th>
                  <th>Status</th>
                  <th>Rows</th>
                  <th>Warnings / Errors</th>
                  <th>Imported At</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((batch) => (
                  <tr key={batch.id}>
                    <td>
                      <div className="font-medium text-slate-900">{batch.sourceFilename}</div>
                      <div className="mt-1 font-mono text-[11px] text-slate-400">{batch.id}</div>
                    </td>
                    <td>
                      {batch.billingCycle ? (
                        <div>
                          <div className="font-semibold text-slate-800">
                            {monthLabel(batch.billingCycle.month, batch.billingCycle.year)}
                          </div>
                          <div className="text-xs text-slate-500">
                            {batch.billingCycle.building?.name ?? 'Main building'}
                          </div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={statusBadge(batch.status)}>{batch.status}</span>
                    </td>
                    <td>
                      <div className="font-semibold text-slate-800">{batch.totalRows}</div>
                      <div className="text-xs text-slate-500">{batch.validRows} ready rows</div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          {batch.warningRows}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          {batch.invalidRows}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-slate-700">{formatDate(batch.importedAt)}</div>
                      <div className="mt-1 text-xs text-slate-400">Created {formatDate(batch.createdAt)}</div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        {batch.billingCycle ? (
                          <Link href={`/admin/billing/${batch.billingCycle.id}`} className="admin-button text-xs">
                            Cycle
                          </Link>
                        ) : null}
                        {batch.uploadedFileId ? (
                          <Link href={`/admin/billing/batches/${batch.id}/office`} className="admin-button text-xs">
                            ONLYOFFICE
                          </Link>
                        ) : null}
                        <Link href={`/admin/billing/batches/${batch.id}`} className="admin-button text-xs">
                          Details
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="admin-card p-5">
          <div className="mb-3 flex items-center gap-2 text-slate-800">
            <Clock3 className="h-4 w-4 text-indigo-500" />
            <span className="font-semibold">Stage before commit</span>
          </div>
          <p className="text-sm text-slate-500">
            Uploaded workbooks now land in staging first. Staff can inspect totals and room matches before anything touches live billing records.
          </p>
        </div>
        <div className="admin-card p-5">
          <div className="mb-3 flex items-center gap-2 text-slate-800">
            <TriangleAlert className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">Warnings stay visible</span>
          </div>
          <p className="text-sm text-slate-500">
            `TotalAmount` mismatches and validation issues stay attached to the batch so the audit trail does not disappear after the monthly import is done.
          </p>
        </div>
        <div className="admin-card p-5">
          <div className="mb-3 flex items-center gap-2 text-slate-800">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold">Import links are traceable</span>
          </div>
          <p className="text-sm text-slate-500">
            Each committed batch keeps the back-reference to created billing records, so finance can inspect exactly which workbook row produced which room bill.
          </p>
        </div>
      </section>
    </main>
  );
}
