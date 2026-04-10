'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
} from 'lucide-react';

type UploadResult = {
  totalEntries: number;
  imported: number;
  matched: number;
  unmatched: number;
  storageKey: string;
};

export default function UploadStatementPage() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) { setError('กรุณาเลือกไฟล์ Bank Statement ก่อน'); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/payments/statement-upload', { method: 'POST', body: formData });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error?.message ?? 'ไม่สามารถอัปโหลด Statement');
      setResult(json.data as UploadResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถอัปโหลด Statement ธนาคาร');
    } finally { setLoading(false); }
  }

  function resetAll() {
    setFile(null); setResult(null); setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--on-surface)]">อัปโหลด Bank Statement</h1>
          <p className="mt-1 text-sm text-[var(--on-surface-variant)]">อัปโหลด Statement ธนาคาร (CSV หรือ Excel) เพื่อ parse รายการธุรกรรมและจับคู่กับใบแจ้งหนี้โดยอัตโนมัติ</p>
        </div>
        <Link href="/admin/payments" className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]">
          กลับไปการเงิน
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--error-container)] bg-[var(--error-container)]/20 px-4 py-3 text-sm text-[var(--on-error-container)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Upload card */}
      <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--outline-variant)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--on-surface)]">1. อัปโหลด Bank Statement</h2>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all ${
              file
                ? 'border-on-tertiary-container bg-[var(--tertiary-container)]/10'
                : 'border-[var(--outline)] hover:border-[var(--primary)]50 hover:bg-[var(--surface-container)]'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-container)] shadow-sm">
              {file ? (
                <CheckCircle2 className="h-7 w-7 text-[var(--on-tertiary-container)]" />
              ) : (
                <UploadCloud className="h-7 w-7 text-[var(--on-surface-variant)]" />
              )}
            </div>
            <div className="text-lg font-semibold text-[var(--on-surface)]">
              {file ? file.name : 'Drop หรือเลือกไฟล์'}
            </div>
            <p className="mt-2 max-w-md text-sm text-[var(--on-surface-variant)]">
              รองรับ: CSV, XLSX (max 10 MB). ระบบจะ auto-detect คอลัมน์ date, amount และ reference
            </p>
          </div>

          {/* Workflow sidebar */}
          <div className="space-y-4 rounded-xl border border-[var(--outline-variant)] bg-[var(--surface-container)] p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--on-surface-variant)]">ขั้นตอน</div>
              <div className="mt-3 space-y-3 text-sm text-[var(--on-surface)]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-container)] text-xs font-semibold text-[var(--primary-container)]">1</span>
                  อัปโหลด Bank Statement
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-container)] text-xs font-semibold text-[var(--primary-container)]">2</span>
                  ระบบ parse รายการธุรกรรม
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-container)] text-xs font-semibold text-[var(--primary-container)]">3</span>
                  จับคู่กับใบแจ้งหนี้
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-container)] text-xs font-semibold text-[var(--primary-container)]">4</span>
                  ตรวจสอบรายการไม่ตรงใน Payments
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] px-4 py-3 text-sm text-[var(--on-surface)]">
              รายการที่ไม่ตรงจะถูกส่งเข้าแถวตรวจสอบเพื่อ assign ด้วยตนเอง
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={loading || !file}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {loading ? 'Processing...' : 'Upload & Process'}
              </button>
              <button type="button" onClick={resetAll} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2.5 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]">
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Format guide */}
      <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-[var(--outline-variant)]/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--outline-variant)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--on-surface)]">รูปแบบไฟล์ที่รองรับ</h2>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--outline-variant)]">
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">คอลัมน์</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">ต้องระบุ</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">คำอธิบาย</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--on-surface-variant)]">ตรวจจับชื่ออัตโนมัติ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--outline-variant)]/5">
                <td className="px-4 py-3 font-semibold text-[var(--on-surface)]">วันที่</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-[var(--error-container)] px-2.5 py-0.5 text-xs font-semibold text-[var(--on-error-container)]">ต้องระบุ</span></td>
                <td className="px-4 py-3 text-[var(--on-surface-variant)]">วันที่ธุรกรรม</td>
                <td className="px-4 py-3 text-[var(--on-surface-variant)]/60">date, วันที่</td>
              </tr>
              <tr className="border-b border-[var(--outline-variant)]/5">
                <td className="px-4 py-3 font-semibold text-[var(--on-surface)]">จำนวน</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-[var(--error-container)] px-2.5 py-0.5 text-xs font-semibold text-[var(--on-error-container)]">ต้องระบุ</span></td>
                <td className="px-4 py-3 text-[var(--on-surface-variant)]">จำนวนธุรกรรม</td>
                <td className="px-4 py-3 text-[var(--on-surface-variant)]/60">amount, จำนวนเงิน, debit, credit, deposit, withdraw</td>
              </tr>
              <tr className="border-b border-[var(--outline-variant)]/5">
                <td className="px-4 py-3 font-semibold text-[var(--on-surface)]">รายละเอียด</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-[var(--surface-container)] px-2.5 py-0.5 text-xs font-semibold text-[var(--on-surface-variant)]">ไม่บังคับ</span></td>
                <td className="px-4 py-3 text-[var(--on-surface-variant)]">รายละเอียดธุรกรรม</td>
                <td className="px-4 py-3 text-[var(--on-surface-variant)]/60">description, รายละเอียด, detail, narrative</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-[var(--on-surface)]">อ้างอิง</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-[var(--surface-container)] px-2.5 py-0.5 text-xs font-semibold text-[var(--on-surface-variant)]">ไม่บังคับ</span></td>
                <td className="px-4 py-3 text-[var(--on-surface-variant)]">หมายเลขอ้างอิง</td>
                <td className="px-4 py-3 text-[var(--on-surface-variant)]/60">reference, เลขที่อ้างอิง, ref</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-[var(--surface-container-lowest)] rounded-xl border border-on-tertiary-container/20 overflow-hidden">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--tertiary-container)]/20 shadow-sm">
                <CheckCircle2 className="h-7 w-7 text-[var(--on-tertiary-container)]" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[var(--on-surface)]">อัปโหลดสำเร็จ!</h2>
                <p className="mt-1 text-sm text-[var(--on-surface-variant)]">
                  ประมวลผล {result.totalEntries} รายการจาก Bank Statement ของคุณ
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/payments" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-[var(--on-primary)] shadow-sm transition-colors hover:bg-primary/90">
                ไปที่ Payments
              </Link>
              <Link href="/admin/payments/review" className="inline-flex items-center gap-2 rounded-lg border border-[var(--outline)] bg-[var(--surface-container-lowest)] px-4 py-2 text-sm font-medium text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-container)]">
                ตรวจสอบ ({result.unmatched})
              </Link>
            </div>
          </div>

          <div className="grid gap-4 p-6 pt-0 sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-[var(--surface-container)] rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">รายการทั้งหมด</p>
              <p className="mt-1 text-2xl font-bold text-[var(--on-surface)]">{result.totalEntries}</p>
            </div>
            <div className="bg-[var(--surface-container)] rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">นำเข้าแล้ว</p>
              <p className="mt-1 text-2xl font-bold text-[var(--on-tertiary-container)]">{result.imported}</p>
            </div>
            <div className="bg-[var(--surface-container)] rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">จับคู่อัตโนมัติ</p>
              <p className="mt-1 text-2xl font-bold text-[var(--primary)]">{result.matched}</p>
            </div>
            <div className="bg-[var(--surface-container)] rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--on-surface-variant)]">ต้องตรวจสอบ</p>
              <p className="mt-1 text-2xl font-bold text-amber-600">{result.unmatched}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
