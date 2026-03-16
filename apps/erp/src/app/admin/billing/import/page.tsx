'use client';

import React, { useCallback, useRef, useState } from 'react';
import {
  CheckCircle,
  ChevronDown,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedRow {
  rowNo?: number;
  roomNumber: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  year: number;
  month: number;
}

interface PreviewRow {
  rowNo: number;
  roomNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  status: 'VALID' | 'ERROR';
  errorMessage?: string;
}

interface PreviewData {
  rows: ParsedRow[];
  preview: { roomNumber: string; year: number; month: number; total: number; count: number }[];
  warnings: { roomNumber: string; year: number; month: number; expectedTotal: number; calculatedTotal: number; difference: number }[];
}

interface ImportResult {
  batchId: string;
  cycleId: string;
  imported?: number;
  totalImported?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPreviewRows(rows: ParsedRow[], warnings: PreviewData['warnings']): PreviewRow[] {
  const warningMap = new Map(
    warnings.map((w) => [`${w.roomNumber}:${w.year}:${w.month}`, w]),
  );

  return rows.map((r, i) => {
    const amount = r.quantity * r.unitPrice;
    const warnKey = `${r.roomNumber}:${r.year}:${r.month}`;
    const warn = warningMap.get(warnKey);

    return {
      rowNo: r.rowNo ?? i + 1,
      roomNumber: r.roomNumber,
      description: r.description ?? '',
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      amount,
      status: warn ? 'ERROR' : 'VALID',
      errorMessage: warn
        ? `Total mismatch: expected ${warn.expectedTotal.toFixed(2)}, got ${warn.calculatedTotal.toFixed(2)}`
        : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: 'Upload' },
    { n: 2, label: 'Preview' },
    { n: 3, label: 'Done' },
  ] as const;

  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, idx) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <React.Fragment key={s.n}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  done
                    ? 'bg-green-600 border-green-600 text-white'
                    : active
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {done ? <CheckCircle className="w-4 h-4" /> : s.n}
              </div>
              <span
                className={`text-xs font-medium ${
                  active ? 'text-blue-600' : done ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mt-[-12px] ${
                  current > s.n ? 'bg-green-500' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ValidationBadge({ status }: { status: 'VALID' | 'ERROR' }) {
  return status === 'VALID' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <CheckCircle className="w-3 h-3" /> Valid
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" /> Error
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BillingImportPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const buildingId = 'seed-building-main';
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [rawFormData, setRawFormData] = useState<FormData | null>(null);

  // Step 3 state
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // -------------------------------------------------------------------------
  // Drag & drop
  // -------------------------------------------------------------------------

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  // -------------------------------------------------------------------------
  // Upload & preview
  // -------------------------------------------------------------------------

  const handleUploadPreview = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }
    setError(null);
    setLoading(true);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('year', String(year));
    fd.append('month', String(month));
    fd.append('buildingId', buildingId);

    try {
      // Try preview endpoint first
      let res = await fetch('/api/billing/import/preview', {
        method: 'POST',
        body: fd,
      });

      if (!res.ok && res.status === 404) {
        // Fallback: use execute directly and skip preview step
        res = await fetch('/api/billing/import/execute', {
          method: 'POST',
          body: fd,
        });
        if (!res.ok) throw new Error(`Import failed: ${res.status}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message ?? 'Import failed');
        setImportResult(json.data as ImportResult);
        setStep(3);
        return;
      }

      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'Preview failed');

      const data = json.data as PreviewData;
      const rows = buildPreviewRows(data.rows, data.warnings ?? []);
      setPreviewRows(rows);

      // Store form data for execute step
      const fd2 = new FormData();
      fd2.append('file', file);
      fd2.append('year', String(year));
      fd2.append('month', String(month));
      fd2.append('buildingId', buildingId);
      setRawFormData(fd2);

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Confirm import
  // -------------------------------------------------------------------------

  const handleConfirmImport = async () => {
    if (!rawFormData) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/billing/import/execute', {
        method: 'POST',
        body: rawFormData,
      });

      if (!res.ok) throw new Error(`Execute failed: ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'Import execute failed');

      setImportResult(json.data as ImportResult);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  const handleReset = () => {
    setStep(1);
    setFile(null);
    setPreviewRows([]);
    setRawFormData(null);
    setImportResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -------------------------------------------------------------------------
  // Stats derived from previewRows
  // -------------------------------------------------------------------------

  const validCount = previewRows.filter((r) => r.status === 'VALID').length;
  const errorCount = previewRows.filter((r) => r.status === 'ERROR').length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Page header */}
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Excel Import Wizard</h1>
          <p className="admin-page-subtitle">
            Import billing data from Excel files into the system.
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto p-6">
        <StepIndicator current={step} />

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* STEP 1: Upload                                                   */}
        {/* ---------------------------------------------------------------- */}
        {step === 1 && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Step 1: Upload Excel File</h2>

            {/* Drag & Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 cursor-pointer transition-colors ${
                dragging
                  ? 'border-blue-400 bg-blue-50'
                  : file
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-300 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              {file ? (
                <>
                  <FileSpreadsheet className="h-12 w-12 text-green-500" />
                  <p className="text-base font-medium text-green-700">{file.name}</p>
                  <p className="text-sm text-green-600">
                    {(file.size / 1024).toFixed(1)} KB &mdash; click to change
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-12 w-12 text-gray-400" />
                  <p className="text-base font-medium text-gray-700">
                    Drag &amp; drop your Excel file here
                  </p>
                  <p className="text-sm text-blue-600 underline">Or click to browse</p>
                </>
              )}
            </div>

            {/* File requirements */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
              <p className="font-semibold">File requirements:</p>
              <p>Excel format (.xlsx or .xls)</p>
              <p>Column A: Room Number &bull; Column B: Description &bull; Column C: Quantity &bull; Column D: Unit Price</p>
            </div>

            {/* Year / Month / Building */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Year */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Year</label>
                <div className="relative">
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Month */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Month</label>
                <div className="relative">
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 py-2 pr-8 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {THAI_MONTHS.map((name, idx) => (
                      <option key={idx + 1} value={idx + 1}>
                        {idx + 1} – {name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                </div>
              </div>

              {/* Building ID (readonly) */}
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Building ID</label>
                <input
                  type="text"
                  value={buildingId}
                  readOnly
                  className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>

            {/* Upload button */}
            <button
              onClick={handleUploadPreview}
              disabled={loading || !file}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" /> Upload &amp; Preview
                </>
              )}
            </button>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* STEP 2: Preview                                                  */}
        {/* ---------------------------------------------------------------- */}
        {step === 2 && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Step 2: Preview &amp; Confirm</h2>

            {/* Summary banner */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{previewRows.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total Rows Found</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-green-700">{validCount}</p>
                <p className="text-xs text-green-600 mt-0.5">Valid Rows</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center">
                <p className="text-2xl font-bold text-red-700">{errorCount}</p>
                <p className="text-xs text-red-600 mt-0.5">Rows with Errors</p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Row #', 'Room', 'Description', 'Qty', 'Unit Price', 'Amount', 'Status'].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {previewRows.map((row) => (
                    <tr
                      key={row.rowNo}
                      className={row.status === 'ERROR' ? 'bg-red-50' : undefined}
                    >
                      <td className="px-4 py-2.5 text-gray-500">{row.rowNo}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{row.roomNumber}</td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-[200px] truncate">
                        {row.description || <span className="text-gray-400 italic">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{row.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">
                        {row.unitPrice.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                        {row.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="space-y-1">
                          <ValidationBadge status={row.status} />
                          {row.errorMessage && (
                            <p className="text-xs text-red-600">{row.errorMessage}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleConfirmImport}
                disabled={loading || validCount === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" /> Confirm Import
                  </>
                )}
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel / Re-upload
              </button>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* STEP 3: Done                                                     */}
        {/* ---------------------------------------------------------------- */}
        {step === 3 && importResult && (
          <div className="rounded-xl border border-green-200 bg-green-50 shadow-sm p-10 flex flex-col items-center gap-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <div>
              <h2 className="text-2xl font-bold text-green-800">Import Complete</h2>
              <p className="mt-1 text-sm text-green-700">
                Your billing data has been successfully imported.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-6 w-full max-w-sm">
              <div className="rounded-lg border border-green-200 bg-white px-4 py-3">
                <p className="text-2xl font-bold text-gray-900">
                  {importResult.totalImported ?? importResult.imported ?? '—'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Records Imported</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-white px-4 py-3">
                <p className="text-xs font-mono text-gray-400 truncate">
                  {importResult.cycleId ?? '—'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Billing Cycle ID</p>
              </div>
            </div>

            {/* Links */}
            <div className="flex flex-wrap justify-center gap-3">
              {importResult.cycleId && (
                <a
                  href={`/admin/billing/${importResult.cycleId}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  View Billing Cycle
                </a>
              )}
              {importResult.batchId && (
                <a
                  href={`/admin/billing/batches/${importResult.batchId}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  View Batch
                </a>
              )}
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Import Another
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
