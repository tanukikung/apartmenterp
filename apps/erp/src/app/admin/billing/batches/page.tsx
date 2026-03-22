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
  if (status === 'IMPORTED') return 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-tertiary-container text-on-tertiary-container';
  if (status === 'FAILED') return 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-error-container text-on-error-container';
  if (status === 'VALIDATED') return 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200';
  return 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-surface-container text-on-surface-variant border border-outline-variant';
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
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-on-primary">Billing Import Batches</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">
              Every workbook is staged here first, validated row-by-row, and then committed into live billing records.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/billing/import" className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-white/30">
              New Import
            </Link>
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-error-container bg-error-container/20 px-4 py-3 text-sm font-medium text-on-error-container">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Total Batches</div>
          <div className="text-2xl font-extrabold text-primary">{stats.total}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Imported</div>
          <div className="text-2xl font-extrabold text-primary text-emerald-600">{stats.imported}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Needs Review</div>
          <div className="text-2xl font-extrabold text-primary text-amber-600">{stats.needsReview}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Latest Import</div>
          <div className="mt-2 text-sm font-medium text-on-surface">{formatDate(stats.latestImportedAt)}</div>
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant">
          <div className="text-sm font-semibold text-primary">Batch Library</div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search batch, filename, cycle..."
                className="w-full rounded-xl border border-outline bg-surface-container-lowest pl-9 pr-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as BatchStatus | 'ALL')}
              className="w-full rounded-xl border border-outline bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
          <div className="flex items-center justify-center py-16 text-on-surface-variant">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading import batches...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FileSpreadsheet className="h-10 w-10 text-on-surface-variant" />
            <div>
              <div className="font-semibold text-on-surface">No import batches found</div>
              <div className="text-sm text-on-surface-variant">Upload the first workbook to start staging monthly billing.</div>
            </div>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-surface-container">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Batch</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Cycle</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Status</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Rows</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Warnings / Errors</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Imported At</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filtered.map((batch) => (
                  <tr key={batch.id} className="hover:bg-surface-container-lowest transition-colors">
                    <td>
                      <div className="font-medium text-on-surface">{batch.sourceFilename}</div>
                      <div className="mt-1 font-mono text-[11px] text-on-surface-variant">{batch.id}</div>
                    </td>
                    <td>
                      {batch.billingCycle ? (
                        <div>
                          <div className="font-semibold text-on-surface">
                            {monthLabel(batch.billingCycle.month, batch.billingCycle.year)}
                          </div>
                          <div className="text-xs text-on-surface-variant">
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
                      <div className="font-semibold text-on-surface">{batch.totalRows}</div>
                      <div className="text-xs text-on-surface-variant">{batch.validRows} ready rows</div>
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
                      <div className="text-sm text-on-surface">{formatDate(batch.importedAt)}</div>
                      <div className="mt-1 text-xs text-on-surface-variant">Created {formatDate(batch.createdAt)}</div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        {batch.billingCycle ? (
                          <Link href={`/admin/billing/${batch.billingCycle.id}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container text-xs">
                            Cycle
                          </Link>
                        ) : null}
                        {batch.uploadedFileId ? (
                          <Link href={`/admin/billing/batches/${batch.id}/office`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container text-xs">
                            ONLYOFFICE
                          </Link>
                        ) : null}
                        <Link href={`/admin/billing/batches/${batch.id}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container text-xs">
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
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="mb-3 flex items-center gap-2 text-on-surface">
            <Clock3 className="h-4 w-4 text-primary" />
            <span className="font-semibold">Stage before commit</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            Uploaded workbooks now land in staging first. Staff can inspect totals and room matches before anything touches live billing records.
          </p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="mb-3 flex items-center gap-2 text-on-surface">
            <TriangleAlert className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">Warnings stay visible</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            `TotalAmount` mismatches and validation issues stay attached to the batch so the audit trail does not disappear after the monthly import is done.
          </p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="mb-3 flex items-center gap-2 text-on-surface">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold">Import links are traceable</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            Each committed batch keeps the back-reference to created billing records, so finance can inspect exactly which workbook row produced which room bill.
          </p>
        </div>
      </section>
    </main>
  );
}
