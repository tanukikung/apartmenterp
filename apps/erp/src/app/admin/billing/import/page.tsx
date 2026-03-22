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
  Calendar,
  FileText,
} from 'lucide-react';

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
  type: 'total_mismatch' | 'water_mismatch' | 'electric_mismatch' | 'meter_reset';
  message: string;
};

type PreviewResult = {
  rows: unknown[];
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

const THAI_MONTHS = [
  { value: 1, label: 'มกราคม' },
  { value: 2, label: 'กุมภาพันธ์' },
  { value: 3, label: 'มีนาคม' },
  { value: 4, label: 'เมษายน' },
  { value: 5, label: 'พฤษภาคม' },
  { value: 6, label: 'มิถุนายน' },
  { value: 7, label: 'กรกฎาคม' },
  { value: 8, label: 'สิงหาคม' },
  { value: 9, label: 'กันยายน' },
  { value: 10, label: 'ตุลาคม' },
  { value: 11, label: 'พฤศจิกายน' },
  { value: 12, label: 'ธันวาคม' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

type ImportMode = 'template' | 'monthly';

export default function BillingImportPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('template');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

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

      let endpoint = '/api/billing/import/preview';
      if (importMode === 'monthly') {
        endpoint = '/api/billing/monthly-data/import';
        formData.append('year', String(selectedYear));
        formData.append('month', String(selectedMonth));
      }

      const response = await fetch(endpoint, {
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
      let endpoint = '/api/billing/import/execute';
      if (importMode === 'monthly') {
        endpoint = '/api/billing/monthly-data/import/execute';
      }

      const response = await fetch(endpoint, {
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
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-on-primary">Billing Import</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">
              Upload the monthly Excel workbook, validate every room, then commit the batch into billing records.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/billing_template.xlsx" download="billing_template.xlsx" className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30">
              <FileSpreadsheet className="h-4 w-4" />
              ดาวน์โหลด Template
            </a>
            <Link href="/admin/billing/batches" className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30">
              View Batches
            </Link>
          </div>
        </div>
      </div>

      {error ? (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Import Mode Tabs */}
      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-outline-variant">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setImportMode('template');
                resetAll();
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                importMode === 'template'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <FileText className="h-4 w-4" />
              Standard Template
            </button>
            <button
              type="button"
              onClick={() => {
                setImportMode('monthly');
                resetAll();
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                importMode === 'monthly'
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Monthly Data (billing_template.xlsx)
            </button>
          </div>
        </div>

        {importMode === 'monthly' && (
          <div className="px-5 py-4 border-b border-outline-variant bg-amber-50/50">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-on-surface">เดือน:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none"
                >
                  {THAI_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-on-surface">ปี:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-sm text-on-surface focus:border-primary focus:outline-none"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-on-surface-variant">
                ดาวน์โหลด template:{' '}
                <a href="/billing_template.xlsx" download="billing_template.xlsx" className="text-primary underline hover:no-underline">
                  billing_template.xlsx
                </a>
                {' '}→ กรอกข้อมูล → upload
              </div>
            </div>
          </div>
        )}
      </div>

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
        <div className="px-5 py-4 border-b border-outline-variant">
          <div className="text-sm font-semibold text-primary">1. Upload Workbook</div>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div
            onClick={() => fileRef.current?.click()}
            className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed px-6 py-10 text-center transition-all ${
              file
                ? 'border-emerald-300 bg-emerald-50/80'
                : 'border-outline-variant bg-surface-container-lowest hover:border-primary/30 hover:bg-primary-container/30'
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
                <UploadCloud className="h-8 w-8 text-on-surface-variant" />
              )}
            </div>
            <div className="text-lg font-semibold text-on-surface">
              {file ? file.name : 'Drop or choose the Excel file'}
            </div>
            <p className="mt-2 max-w-md text-sm text-on-surface-variant">
              {importMode === 'template' ? (
                <>
                  Upload the standard Excel template with <code className="rounded bg-surface-container px-1 py-0.5 text-xs">FLOOR_*</code> sheets.
                </>
              ) : (
                <>
                  Upload <code className="rounded bg-surface-container px-1 py-0.5 text-xs">billing_template.xlsx</code> ที่กรอกข้อมูลแล้ว
                  — รองรับทั้ง format ใหม่ <code className="rounded bg-surface-container px-1 py-0.5 text-xs">ชั้น_1</code> และ format เดิม <code className="rounded bg-surface-container px-1 py-0.5 text-xs">ชั้น 1</code>
                  <br />
                  <span className="text-amber-700">ห้องที่มี ค่าเช่า = 0 จะถูกตั้งเป็นสถานะว่าง (INACTIVE)</span>
                </>
              )}
            </p>
          </div>

          <div className="space-y-4 rounded-[2rem] border border-outline-variant bg-surface-container-lowest/80 p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
                Workflow
              </div>
              <div className="mt-3 space-y-3 text-sm text-on-surface">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary-container text-xs font-semibold text-primary">1</span>
                  Upload workbook
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary-container text-xs font-semibold text-primary">2</span>
                  Review staged rows
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary-container text-xs font-semibold text-primary">3</span>
                  Commit validated batch
                </div>
              </div>
            </div>

            {importMode === 'monthly' && (
              <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <strong>สำหรับไฟล์ Monthly Data:</strong><br />
                • ห้องที่ <code className="rounded bg-amber-100 px-1">ค่าเช่า = 0</code> จะถือว่าเป็น <strong>ห้องว่าง (INACTIVE)</strong><br />
                • เดือน/ปี ที่เลือกจะถูกใช้เป็น billing period
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={loading || !file}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90 flex flex-1 items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {loading ? 'Previewing...' : 'Preview Batch'}
              </button>
              <button type="button" onClick={resetAll} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      {preview ? (
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Batch ID</div>
              <div className="mt-2 font-mono text-xs text-on-surface">{preview.batch.id}</div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Billing Cycle</div>
              <div className="mt-2 text-sm font-semibold text-on-surface">{preview.batch.billingCycleId.slice(0, 8)}…</div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Rooms</div>
              <div className="mt-2 text-sm font-semibold text-on-surface">{totals.rooms}</div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Valid / Error</div>
              <div className="mt-2 text-sm font-semibold text-on-surface">
                {preview.batch.validRows} / {preview.batch.invalidRows}
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Batch Total</div>
              <div className="mt-2 text-sm font-semibold text-on-surface">{money(totals.totalAmount)}</div>
            </div>
          </div>

          {preview.warnings.length > 0 ? (
            <section className="bg-surface-container-lowest rounded-xl border overflow-hidden border-amber-200">
              <div className="px-5 py-4 border-b border-outline-variant">
                <div className="text-sm font-semibold text-amber-800">Warnings / คำเตือน</div>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border-amber-300 bg-amber-50 text-amber-700">
                  {preview.warnings.length} room{preview.warnings.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-surface-container">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Room</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Type</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Issue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {preview.warnings.map((warning) => (
                      <tr key={`${warning.roomNumber}-${warning.year}-${warning.month}`} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="font-semibold text-on-surface">{warning.roomNumber}</td>
                        <td>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            warning.type === 'meter_reset' ? 'border-orange-300 bg-orange-50 text-orange-700' :
                            warning.type === 'water_mismatch' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                            warning.type === 'electric_mismatch' ? 'border-purple-300 bg-purple-50 text-purple-700' :
                            'border-amber-300 bg-amber-50 text-amber-700'
                          }`}>
                            {warning.type === 'meter_reset' ? 'มิเตอร์ถูกเปลี่ยน' :
                             warning.type === 'water_mismatch' ? 'ค่าน้ำ' :
                             warning.type === 'electric_mismatch' ? 'ค่าไฟ' :
                             warning.type === 'total_mismatch' ? 'รวมเงิน' : warning.type}
                          </span>
                        </td>
                        <td className="text-amber-700">{warning.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            <div className="px-5 py-4 border-b border-outline-variant">
              <div className="text-sm font-semibold text-primary">Room Preview</div>
              <div className="flex items-center gap-2">
                <Link href={`/admin/billing/batches/${preview.batch.id}/office`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                  Edit In ONLYOFFICE
                </Link>
                <Link href={`/admin/billing/batches/${preview.batch.id}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                  Open Batch Detail
                </Link>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-surface-container">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Room</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Period</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Items</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Total</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {preview.preview.map((group) => {
                    const groupWarnings = preview.warnings.find(
                      (warning) =>
                        warning.roomNumber === group.roomNumber &&
                        warning.year === group.year &&
                        warning.month === group.month,
                    );

                    return (
                      <tr key={`${group.roomNumber}-${group.year}-${group.month}`} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="font-semibold text-on-surface">{group.roomNumber}</td>
                        <td>
                          {group.month}/{group.year}
                        </td>
                        <td>{group.count}</td>
                        <td>{money(group.total)}</td>
                        <td>
                          {groupWarnings ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border-amber-300 bg-amber-50 text-amber-700">
                              Total mismatch
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-tertiary-container text-on-tertiary-container">Ready</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="text-base font-semibold text-on-surface">2. Commit Staged Batch</div>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Execution writes validated staged rows into live billing records and links them back to this batch for audit.
                </p>
              </div>
              <div className="flex gap-3">
                <Link href={`/admin/billing/batches/${preview.batch.id}/office`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                  Open Workbook
                </Link>
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Preview
                </button>
                <button
                  type="button"
                  onClick={() => void handleExecute()}
                  disabled={executing || preview.warnings.length > 0 || preview.batch.invalidRows > 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
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
        <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 border-emerald-200 bg-emerald-50/70">
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
              <Link href={`/admin/billing/${result.cycleId}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                Open Billing Cycle
              </Link>
              <Link href={`/admin/billing/batches/${result.batchId}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                Open Batch Detail
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
