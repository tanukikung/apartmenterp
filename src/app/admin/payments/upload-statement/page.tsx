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
          <h1 className="text-2xl font-bold text-[hsl(var(--color-text))]">อัปโหลด Bank Statement</h1>
          <p className="mt-1 text-sm text-[hsl(var(--color-text))]/40">อัปโหลด Statement ธนาคาร (CSV หรือ Excel) เพื่อ parse รายการธุรกรรมและจับคู่กับใบแจ้งหนี้โดยอัตโนมัติ</p>
        </div>
        <Link href="/admin/payments" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))]/70 shadow-sm transition-all hover:bg-[hsl(var(--color-surface))]/80 hover:border-[hsl(var(--color-border))]/80 active:scale-[0.98]">
          กลับไปการเงิน
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Upload card */}
      <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
          <h2 className="text-sm font-semibold text-[hsl(var(--color-text))]">1. อัปโหลด Bank Statement</h2>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all active:scale-[0.98] ${
              file
                ? 'border-emerald-500/50 bg-emerald-500/10'
                : 'border-white/10 hover:border-white/20 hover:bg-[hsl(var(--color-surface))]'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--color-surface))]/50 backdrop-blur shadow-sm">
              {file ? (
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              ) : (
                <UploadCloud className="h-7 w-7 text-[hsl(var(--color-text))]/30" />
              )}
            </div>
            <div className="text-lg font-semibold text-[hsl(var(--color-text))]">
              {file ? file.name : 'Drop หรือเลือกไฟล์'}
            </div>
            <p className="mt-2 max-w-md text-sm text-[hsl(var(--color-text))]/30">
              รองรับ: CSV, XLSX (max 10 MB). ระบบจะ auto-detect คอลัมน์ date, amount และ reference
            </p>
          </div>

          {/* Workflow sidebar */}
          <div className="space-y-4 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-text))]/40">ขั้นตอน</div>
              <div className="mt-3 space-y-3 text-sm text-[hsl(var(--color-text))]">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))]/20 text-xs font-semibold text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30">1</span>
                  อัปโหลด Bank Statement
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))]/20 text-xs font-semibold text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30">2</span>
                  ระบบ parse รายการธุรกรรม
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))]/20 text-xs font-semibold text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30">3</span>
                  จับคู่กับใบแจ้งหนี้
                </div>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--primary))]/20 text-xs font-semibold text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30">4</span>
                  ตรวจสอบรายการไม่ตรงใน Payments
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur px-4 py-3 text-sm text-[hsl(var(--color-text))]/50">
              รายการที่ไม่ตรงจะถูกส่งเข้าแถวตรวจสอบเพื่อ assign ด้วยตนเอง
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={loading || !file}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--color-text))] shadow-glow-primary transition-all hover:shadow-glow-primary-hover active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                {loading ? 'Processing...' : 'Upload & Process'}
              </button>
              <button type="button" onClick={resetAll} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur px-4 py-2.5 text-sm font-medium text-[hsl(var(--color-text))]/60 transition-all hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98]">
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Format guide */}
      <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[hsl(var(--color-border))] px-4 py-3">
          <h2 className="text-sm font-semibold text-[hsl(var(--color-text))]">รูปแบบไฟล์ที่รองรับ</h2>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/50">
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/40">คอลัมน์</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/40">ต้องระบุ</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/40">คำอธิบาย</th>
                <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-text))]/40">ตรวจจับชื่ออัตโนมัติ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/[0.05]">
                <td className="px-4 py-3 font-semibold text-[hsl(var(--color-text))]">วันที่</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400 border border-red-500/30">ต้องระบุ</span></td>
                <td className="px-4 py-3 text-[hsl(var(--color-text))]/40">วันที่ธุรกรรม</td>
                <td className="px-4 py-3 text-[hsl(var(--color-text))]/20">date, วันที่</td>
              </tr>
              <tr className="border-b border-white/[0.05]">
                <td className="px-4 py-3 font-semibold text-[hsl(var(--color-text))]">จำนวน</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400 border border-red-500/30">ต้องระบุ</span></td>
                <td className="px-4 py-3 text-[hsl(var(--color-text))]/40">จำนวนธุรกรรม</td>
                <td className="px-4 py-3 text-[hsl(var(--color-text))]/20">amount, จำนวนเงิน, debit, credit, deposit, withdraw</td>
              </tr>
              <tr className="border-b border-white/[0.05]">
                <td className="px-4 py-3 font-semibold text-[hsl(var(--color-text))]">รายละเอียด</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--color-text))]/50 border border-[hsl(var(--color-border))]">ไม่บังคับ</span></td>
                <td className="px-4 py-3 text-[hsl(var(--color-text))]/40">รายละเอียดธุรกรรม</td>
                <td className="px-4 py-3 text-[hsl(var(--color-text))]/20">description, รายละเอียด, detail, narrative</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-semibold text-[hsl(var(--color-text))]">อ้างอิง</td>
                <td className="px-4 py-3"><span className="inline-flex items-center rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--color-text))]/50 border border-[hsl(var(--color-border))]">ไม่บังคับ</span></td>
                <td className="px-4 py-3 text-[hsl(var(--color-text))]/40">หมายเลขอ้างอิง</td>
                <td className="px-4 py-3 text-[hsl(var(--color-text))]/20">reference, เลขที่อ้างอิง, ref</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-emerald-500/30 rounded-xl overflow-hidden">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 shadow-sm border border-emerald-500/30">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[hsl(var(--color-text))]">อัปโหลดสำเร็จ!</h2>
                <p className="mt-1 text-sm text-[hsl(var(--color-text))]/40">
                  ประมวลผล {result.totalEntries} รายการจาก Bank Statement ของคุณ
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/payments" className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-text))] shadow-glow-primary transition-all hover:shadow-glow-primary-hover active:scale-[0.98]">
                ไปที่ Payments
              </Link>
              <Link href="/admin/payments/review" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))]/70 transition-all hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98]">
                ตรวจสอบ ({result.unmatched})
              </Link>
            </div>
          </div>

          <div className="grid gap-4 p-6 pt-0 sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--color-text))]/40">รายการทั้งหมด</p>
              <p className="mt-1 text-2xl font-extrabold text-[hsl(var(--color-text))]">{result.totalEntries}</p>
            </div>
            <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--color-text))]/40">นำเข้าแล้ว</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-600">{result.imported}</p>
            </div>
            <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--color-text))]/40">จับคู่อัตโนมัติ</p>
              <p className="mt-1 text-2xl font-extrabold text-[hsl(var(--primary))]">{result.matched}</p>
            </div>
            <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--color-text))]/40">ต้องตรวจสอบ</p>
              <p className="mt-1 text-2xl font-extrabold text-amber-600">{result.unmatched}</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
