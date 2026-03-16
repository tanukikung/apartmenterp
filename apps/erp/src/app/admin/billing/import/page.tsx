'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';

type PreviewLineItem = {
  roomNumber: string;
  year: number;
  month: number;
  typeCode: string;
  quantity: number;
  unitPrice: number;
  description?: string;
};

type PreviewGroup = {
  roomNumber: string;
  year: number;
  month: number;
  total: number;
  count: number;
};

type PreviewWarning = {
  roomNumber: string;
  year: number;
  month: number;
  expectedTotal: number;
  calculatedTotal: number;
  difference: number;
};

type PreviewResult = {
  rows: PreviewLineItem[];
  preview: PreviewGroup[];
  warnings: PreviewWarning[];
  batch: {
    id: string;
    status: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
    billingCycleId: string;
  };
};

type ExecuteResult = {
  batchId: string;
  cycleId: string;
  totalImported: number;
};

function money(value: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(value);
}

export default function BillingImportPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => {
    if (!preview) return { rooms: 0, totalAmount: 0 };
    return {
      rooms: preview.preview.length,
      totalAmount: preview.preview.reduce((sum, row) => sum + row.total, 0),
    };
  }, [preview]);

  async function handlePreview() {
    if (!file) {
      setError('Select an Excel file before previewing.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/billing/import/preview', {
        method: 'POST',
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to preview import batch');
      }

      setPreview(json.data as PreviewResult);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Unable to preview import batch');
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!preview?.batch.id) return;

    setExecuting(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: preview.batch.id }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'Unable to execute import batch');
      }

      setResult(json.data as ExecuteResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute import batch');
    } finally {
      setExecuting(false);
    }
  }

  function resetAll() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Billing Import</h1>
          <p className="admin-page-subtitle">
            Upload the monthly Excel workbook, validate every room, then commit the batch into billing records.
          </p>
        </div>
        <div className="admin-toolbar">
          <a href="/billing-import-template.xlsx" className="admin-button">
            Download Template
          </a>
          <Link href="/admin/billing/batches" className="admin-button">
            View Batches
          </Link>
        </div>
      </section>

      {error ? (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">1. Upload Workbook</div>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div
            onClick={() => fileRef.current?.click()}
            className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed px-6 py-10 text-center transition-all ${
              file
                ? 'border-emerald-300 bg-emerald-50/80'
                : 'border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/60'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-white shadow-sm">
              {file ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              ) : (
                <UploadCloud className="h-8 w-8 text-slate-400" />
              )}
            </div>
            <div className="text-lg font-semibold text-slate-900">
              {file ? file.name : 'Drop or choose the Excel file'}
            </div>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              The importer now stages the workbook into a batch first, validates room matches and totals, then allows commit only when blocking issues are cleared.
            </p>
          </div>

          <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50/80 p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Workflow
              </div>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">1</span>
                  Upload workbook
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">2</span>
                  Review staged rows
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">3</span>
                  Commit validated batch
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              `TotalAmount` mismatches are treated as warnings and execution is blocked until the source file is corrected.
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={loading || !file}
                className="admin-button admin-button-primary flex flex-1 items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {loading ? 'Previewing...' : 'Preview Batch'}
              </button>
              <button type="button" onClick={resetAll} className="admin-button">
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      {preview ? (
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="admin-kpi">
              <div className="admin-kpi-label">Batch ID</div>
              <div className="mt-2 font-mono text-xs text-slate-600">{preview.batch.id}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Billing Cycle</div>
              <div className="admin-kpi-value">{preview.batch.billingCycleId.slice(0, 8)}…</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Rooms</div>
              <div className="admin-kpi-value">{totals.rooms}</div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Valid / Error</div>
              <div className="admin-kpi-value">
                {preview.batch.validRows} / {preview.batch.invalidRows}
              </div>
            </div>
            <div className="admin-kpi">
              <div className="admin-kpi-label">Batch Total</div>
              <div className="admin-kpi-value">{money(totals.totalAmount)}</div>
            </div>
          </div>

          {preview.warnings.length > 0 ? (
            <section className="admin-card overflow-hidden border-amber-200">
              <div className="admin-card-header">
                <div className="admin-card-title text-amber-800">Warnings That Block Import</div>
                <span className="admin-badge border-amber-300 bg-amber-50 text-amber-700">
                  {preview.warnings.length} room{preview.warnings.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="overflow-auto">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Expected Total</th>
                      <th>Calculated Total</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.warnings.map((warning) => (
                      <tr key={`${warning.roomNumber}-${warning.year}-${warning.month}`}>
                        <td className="font-semibold text-slate-800">{warning.roomNumber}</td>
                        <td>{money(warning.expectedTotal)}</td>
                        <td>{money(warning.calculatedTotal)}</td>
                        <td className="font-semibold text-amber-700">{money(warning.difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="admin-card overflow-hidden">
            <div className="admin-card-header">
              <div className="admin-card-title">Room Preview</div>
              <div className="admin-toolbar">
                <Link href={`/admin/billing/batches/${preview.batch.id}/office`} className="admin-button">
                  Edit In ONLYOFFICE
                </Link>
                <Link href={`/admin/billing/batches/${preview.batch.id}`} className="admin-button">
                  Open Batch Detail
                </Link>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Period</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((group) => {
                    const groupWarnings = preview.warnings.find(
                      (warning) =>
                        warning.roomNumber === group.roomNumber &&
                        warning.year === group.year &&
                        warning.month === group.month,
                    );

                    return (
                      <tr key={`${group.roomNumber}-${group.year}-${group.month}`}>
                        <td className="font-semibold text-slate-800">{group.roomNumber}</td>
                        <td>
                          {group.month}/{group.year}
                        </td>
                        <td>{group.count}</td>
                        <td>{money(group.total)}</td>
                        <td>
                          {groupWarnings ? (
                            <span className="admin-badge border-amber-300 bg-amber-50 text-amber-700">
                              Total mismatch
                            </span>
                          ) : (
                            <span className="admin-badge admin-status-good">Ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-card">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="text-base font-semibold text-slate-900">2. Commit Staged Batch</div>
                <p className="mt-1 text-sm text-slate-500">
                  Execution writes validated staged rows into live billing records and links them back to this batch for audit.
                </p>
              </div>
              <div className="flex gap-3">
                <Link href={`/admin/billing/batches/${preview.batch.id}/office`} className="admin-button">
                  Open Workbook
                </Link>
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={loading}
                  className="admin-button flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Preview
                </button>
                <button
                  type="button"
                  onClick={() => void handleExecute()}
                  disabled={executing || preview.warnings.length > 0 || preview.batch.invalidRows > 0}
                  className="admin-button admin-button-primary flex items-center gap-2"
                >
                  {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {executing ? 'Executing...' : 'Commit Batch'}
                </button>
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {result ? (
        <section className="admin-card border-emerald-200 bg-emerald-50/70">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-white shadow-sm">
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-emerald-900">Import complete</h2>
                <p className="mt-1 text-sm text-emerald-800">
                  {result.totalImported} billing record{result.totalImported === 1 ? '' : 's'} created from batch {result.batchId}.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/admin/billing/${result.cycleId}`} className="admin-button admin-button-primary">
                Open Billing Cycle
              </Link>
              <Link href={`/admin/billing/batches/${result.batchId}`} className="admin-button">
                Open Batch Detail
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
