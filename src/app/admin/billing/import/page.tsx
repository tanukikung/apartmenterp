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
  X,
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
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const totals = useMemo(() => {
    if (!preview) return { rooms: 0, totalAmount: 0 };
    return {
      rooms: preview.preview.length,
      totalAmount: preview.preview.reduce((sum, row) => sum + row.total, 0),
    };
  }, [preview]);

  async function handlePreview() {
    if (!file) {
      setError('กรุณาเลือกไฟล์ Excel ก่อนดูตัวอย่าง');
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
        throw new Error(json.error?.message ?? 'ไม่สามารถดูตัวอย่างการนำเข้า');
      }

      setPreview(json.data as PreviewResult);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'ไม่สามารถดูตัวอย่างแบทช์นำเข้า');
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
        throw new Error(json.error?.message ?? 'ไม่สามารถดำเนินการนำเข้าแบทช์');
      }

      setResult(json.data as ExecuteResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถดำเนินการนำเข้าแบทช์');
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
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[hsl(var(--on-surface))]">นำเข้าการเรียกเก็บ</h1>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
              อัปโหลดเวิร์กบุ๊ก Excel รายเดือน ตรวจสอบทุกห้อง แล้วยืนยันแบทช์เป็นบันทึกการเรียกเก็บ
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/billing_template.xlsx" download="billing_template.xlsx" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]">
              <FileSpreadsheet className="h-4 w-4" />
              ดาวน์โหลด Template
            </a>
            <Link href="/admin/billing/batches" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]">
              ดูแบทช์
            </Link>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {/* Import Mode Tabs */}
      <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[hsl(var(--color-border))]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setImportMode('template');
                resetAll();
              }}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all active:scale-[0.98] ${
                importMode === 'template'
                  ? 'bg-[hsl(var(--primary))] text-white shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                  : 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] hover:bg-[hsl(var(--color-surface-hover))]'
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
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all active:scale-[0.98] ${
                importMode === 'monthly'
                  ? 'bg-[hsl(var(--primary))] text-white shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                  : 'bg-[hsl(var(--color-surface))] text-[hsl(var(--on-surface-variant))] hover:bg-[hsl(var(--color-surface-hover))'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Monthly Data (billing_template.xlsx)
            </button>
          </div>
        </div>

        {importMode === 'monthly' && (
          <div className="px-5 py-4 border-b border-[hsl(var(--color-border))] bg-amber-500/5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-[hsl(var(--on-surface))]/70">เดือน:</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))]/80 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                >
                  {THAI_MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-[hsl(var(--on-surface))]/70">ปี:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-[hsl(var(--on-surface))]/80 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-sm text-[hsl(var(--on-surface))]/40">
                ดาวน์โหลด template:{' '}
                <a href="/billing_template.xlsx" download="billing_template.xlsx" className="text-[hsl(var(--primary))] underline hover:no-underline">
                  billing_template.xlsx
                </a>
                {' '}→ กรอกข้อมูล → upload
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Upload Section */}
      <section className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-2xl">
        <div className="px-5 py-4 border-b border-[hsl(var(--color-border))]">
          <div className="text-sm font-semibold text-[hsl(var(--primary))]">1. Upload Workbook</div>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div
            onClick={() => fileRef.current?.click()}
            className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[2rem] border-2 border-dashed px-6 py-10 text-center transition-all active:scale-[0.98] ${
              file
                ? 'border-emerald-500/30 bg-emerald-500/5'
                : 'border-[hsl(var(--color-border))] hover:border-[hsl(var(--primary))]/30 hover:bg-[hsl(var(--primary))]/5'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))]">
              {file ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              ) : (
                <UploadCloud className="h-8 w-8 text-[hsl(var(--on-surface))]/30" />
              )}
            </div>
            <div className="text-lg font-semibold text-[hsl(var(--on-surface))]">
              {file ? file.name : 'Drop or choose the Excel file'}
            </div>
            <p className="mt-2 max-w-md text-sm text-[hsl(var(--on-surface))]/40">
              {importMode === 'template' ? (
                <>
                  Upload the standard Excel template with <code className="rounded bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] px-1 py-0.5 text-xs text-[hsl(var(--primary))]">FLOOR_*</code> sheets.
                </>
              ) : (
                <>
                  Upload <code className="rounded bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] px-1 py-0.5 text-xs text-[hsl(var(--primary))]">billing_template.xlsx</code> ที่กรอกข้อมูลแล้ว
                  — รองรับทั้ง format ใหม่ <code className="rounded bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] px-1 py-0.5 text-xs text-[hsl(var(--primary))]">ชั้น_1</code> และ format เดิม <code className="rounded bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] px-1 py-0.5 text-xs text-[hsl(var(--primary))]">ชั้น 1</code>
                  <br />
                  <span className="text-amber-400">ห้องที่มี ค่าเช่า = 0 จะถูกตั้งเป็นสถานะว่าง (INACTIVE)</span>
                </>
              )}
            </p>
          </div>

          <div className="space-y-4 rounded-[2rem] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">
                Workflow
              </div>
              <div className="mt-3 space-y-3 text-sm text-[hsl(var(--on-surface))]/70">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))]/20 border border-[hsl(var(--primary))]/30 text-xs font-semibold text-[hsl(var(--primary))]">1</span>
                  Upload workbook
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))]/20 border border-[hsl(var(--primary))]/30 text-xs font-semibold text-[hsl(var(--primary))]">2</span>
                  Review staged rows
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))]/20 border border-[hsl(var(--primary))]/30 text-xs font-semibold text-[hsl(var(--primary))]">3</span>
                  Commit validated batch
                </div>
              </div>
            </div>

            {importMode === 'monthly' && (
              <div className="rounded-[1.5rem] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                <strong>สำหรับไฟล์ Monthly Data:</strong><br />
                • ห้องที่ <code className="rounded bg-amber-500/10 border border-amber-500/20 px-1">ค่าเช่า = 0</code> จะถือว่าเป็น <strong>ห้องว่าง (INACTIVE)</strong><br />
                • เดือน/ปี ที่เลือกจะถูกใช้เป็น billing period
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={loading || !file}
                className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] flex flex-1 items-center justify-center disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {loading ? 'Previewing...' : 'Preview Batch'}
              </button>
              <button type="button" onClick={resetAll} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]">
                Reset
              </button>
            </div>
          </div>
        </div>
      </section>

      {preview ? (
        <section className="space-y-5">
          {/* Batch stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">รหัสแบทช์</div>
              <div className="mt-2 font-mono text-xs text-[hsl(var(--primary))]">{preview.batch.id}</div>
            </div>
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">รอบการเรียกเก็บ</div>
              <div className="mt-2 text-sm font-semibold text-[hsl(var(--on-surface))]">{preview.batch.billingCycleId.slice(0, 8)}…</div>
            </div>
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ห้อง</div>
              <div className="mt-2 text-sm font-semibold text-[hsl(var(--on-surface))]">{totals.rooms}</div>
            </div>
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ถูกต้อง / ข้อผิดพลาด</div>
              <div className="mt-2 text-sm font-semibold text-[hsl(var(--on-surface))]">
                {preview.batch.validRows} / {preview.batch.invalidRows}
              </div>
            </div>
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ยอดรวมแบทช์</div>
              <div className="mt-2 text-sm font-semibold text-[hsl(var(--on-surface))]">{money(totals.totalAmount)}</div>
            </div>
          </div>

          {/* Warnings */}
          {preview.warnings.length > 0 ? (
            <section className="bg-[hsl(var(--color-surface))] border border-amber-500/20 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[hsl(var(--color-border))]">
                <div className="text-sm font-semibold text-amber-400">Warnings / คำเตือน</div>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border border-amber-500/30 bg-amber-500/20 text-amber-400">
                  {preview.warnings.length} room{preview.warnings.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-[hsl(var(--color-surface))]">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ห้อง</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ประเภท</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ปัญหา</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--color-border))]/50">
                    {preview.warnings.map((warning) => (
                      <tr key={`${warning.roomNumber}-${warning.year}-${warning.month}`} className="hover:bg-[hsl(var(--color-surface-hover))] transition-colors">
                        <td className="font-semibold text-[hsl(var(--on-surface))]">{warning.roomNumber}</td>
                        <td>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            warning.type === 'meter_reset' ? 'border border-orange-500/30 bg-orange-500/10 text-orange-400' :
                            warning.type === 'water_mismatch' ? 'border border-blue-500/30 bg-blue-500/10 text-blue-400' :
                            warning.type === 'electric_mismatch' ? 'border border-violet-500/30 bg-violet-500/10 text-violet-400' :
                            'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                          }`}>
                            {warning.type === 'meter_reset' ? 'มิเตอร์ถูกเปลี่ยน' :
                             warning.type === 'water_mismatch' ? 'ค่าน้ำ' :
                             warning.type === 'electric_mismatch' ? 'ค่าไฟ' :
                             warning.type === 'total_mismatch' ? 'รวมเงิน' : warning.type}
                          </span>
                        </td>
                        <td className="text-amber-400/80">{warning.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* Preview table */}
          <section className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[hsl(var(--color-border))]">
              <div className="text-sm font-semibold text-[hsl(var(--primary))]">ตัวอย่างห้อง</div>
              <div className="flex items-center gap-2 mt-2">
                <Link href={`/admin/billing/batches/${preview.batch.id}`} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]">
                  เปิดรายละเอียดแบทช์
                </Link>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-[hsl(var(--color-surface))]">
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ห้อง</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">รอบ</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">รายการ</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">รวม</th>
                    <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ตรวจสอบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--color-border))]/50">
                  {preview.preview.map((group) => {
                    const groupWarnings = preview.warnings.find(
                      (warning) =>
                        warning.roomNumber === group.roomNumber &&
                        warning.year === group.year &&
                        warning.month === group.month,
                    );

                    return (
                      <tr key={`${group.roomNumber}-${group.year}-${group.month}`} className="hover:bg-[hsl(var(--color-surface-hover))] transition-colors">
                        <td className="font-semibold text-[hsl(var(--on-surface))]">{group.roomNumber}</td>
                        <td className="text-[hsl(var(--on-surface-variant))]">
                          {group.month}/{group.year}
                        </td>
                        <td className="text-[hsl(var(--on-surface-variant))]">{group.count}</td>
                        <td className="text-[hsl(var(--on-surface))] font-semibold">{money(group.total)}</td>
                        <td>
                          {groupWarnings ? (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400">
                              Total mismatch
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">พร้อม</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Commit section */}
          <section className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <div className="text-base font-semibold text-[hsl(var(--on-surface))]">2. Commit Staged Batch</div>
                <p className="mt-1 text-sm text-[hsl(var(--on-surface))]/40">
                  Execution writes validated staged rows into live billing records and links them back to this batch for audit.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh Preview
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={executing || preview.warnings.length > 0 || preview.batch.invalidRows > 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] disabled:opacity-40"
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
        <section className="bg-[hsl(var(--color-surface))] border border-emerald-500/20 rounded-xl">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-emerald-500/20 border border-emerald-500/30">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-emerald-400">นำเข้าเสร็จสมบูรณ์</h2>
                <p className="mt-1 text-sm text-[hsl(var(--on-surface-variant))]">
                  สร้าง {result.totalImported} บันทึกการเรียกเก็บจากแบทช์ {result.batchId}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={`/admin/billing/${result.cycleId}`} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]">
                Open Billing Cycle
              </Link>
              <Link href={`/admin/billing/batches/${result.batchId}`} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]">
                Open Batch Detail
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* Confirmation Dialog */}
      {confirmDialogOpen && preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setConfirmDialogOpen(false)}
          />
          {/* Dialog */}
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30">
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[hsl(var(--on-surface))]">ยืนยันการนำเข้า?</h3>
                <p className="mt-1 text-sm text-[hsl(var(--on-surface-variant))]">
                  การดำเนินการนี้จะเขียนข้อมูล {preview.preview.length} ห้อง รวม {money(totals.totalAmount)} ลงในระบบบิลลิ่ง
                  คุณยืนยันที่จะดำเนินการต่อหรือไม่?
                </p>
              </div>
              <button
                onClick={() => setConfirmDialogOpen(false)}
                className="text-[hsl(var(--on-surface))]/40 hover:text-[hsl(var(--on-surface))]/70 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Summary */}
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3 text-center">
                <div className="text-xs text-[hsl(var(--on-surface))]/40">ห้อง</div>
                <div className="mt-1 text-lg font-semibold text-[hsl(var(--on-surface))]">{totals.rooms}</div>
              </div>
              <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3 text-center">
                <div className="text-xs text-[hsl(var(--on-surface))]/40">ยอดรวม</div>
                <div className="mt-1 text-lg font-semibold text-[hsl(var(--on-surface))]">{money(totals.totalAmount)}</div>
              </div>
              <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3 text-center">
                <div className="text-xs text-[hsl(var(--on-surface))]/40">คำเตือน</div>
                <div className={`mt-1 text-lg font-semibold ${preview.warnings.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {preview.warnings.length}
                </div>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="text-xs font-medium text-amber-400">
                  {preview.warnings.length} room(s) have warnings (e.g. meter resets or total mismatches).
                  Please review them before committing.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialogOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  setConfirmDialogOpen(false);
                  void handleExecute();
                }}
                disabled={executing}
                className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98] disabled:opacity-40"
              >
                {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {executing ? 'กำลังนำเข้า...' : 'ยืนยันนำเข้า'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
