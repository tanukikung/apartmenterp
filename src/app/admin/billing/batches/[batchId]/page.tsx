'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { statusBadgeClassWithBorder } from '@/lib/status-colors';

type BatchRow = {
  roomNo: string;
  floorSheetName: string;
  rentAmount: number;
  waterMode: string;
  waterPrev: number | null;
  waterCurr: number | null;
  waterUnits: number;
  waterTotal: number;
  electricMode: string;
  electricPrev: number | null;
  electricCurr: number | null;
  electricUnits: number;
  electricTotal: number;
  furnitureFee: number;
  otherFee: number;
  totalDue: number;
  note: string | null;
  checkNotes: string | null;
};

type BatchDetail = {
  id: string;
  filename: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsErrored: number;
  createdAt: string;
  billingPeriod: {
    id: string;
    year: number;
    month: number;
    status: string;
  } | null;
  errorLog: unknown;
  rows: unknown[];
};

function money(value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 2,
  }).format(value);
}

function dateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED') {
  if (status === 'COMPLETED') return `inline-flex items-center gap-1 ${statusBadgeClassWithBorder('success')}`;
  if (status === 'FAILED') return `inline-flex items-center gap-1 ${statusBadgeClassWithBorder('danger')}`;
  if (status === 'PROCESSING') return `inline-flex items-center gap-1 ${statusBadgeClassWithBorder('info')}`;
  return `inline-flex items-center gap-1 ${statusBadgeClassWithBorder('neutral')}`;
}

export default function BillingBatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/billing/import/batches/${batchId}`, {
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดรายละเอียดแบทช์นำเข้า');
      }
      setBatch(json.data as BatchDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดแบทช์นำเข้า');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    if (!batch) return { totalAmount: 0, rowCount: 0 };
    const rows = batch.rows as BatchRow[];
    return {
      totalAmount: rows.reduce((sum, row) => sum + (row.totalDue ?? 0), 0),
      rowCount: rows.length,
    };
  }, [batch]);

  async function executeBatch() {
    if (!batch) return;

    setExecuting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/billing/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถดำเนินการแบทช์');
      }

      setMessage(`นำเข้าแบทช์สำเร็จแล้ว สร้าง ${json.data?.totalImported ?? 0} บันทึกการเรียกเก็บ`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถดำเนินการแบทช์');
    } finally {
      setExecuting(false);
    }
  }

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] px-6 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/billing/batches" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]">
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </Link>
            <div>
              <h1 className="text-base font-semibold text-[hsl(var(--on-surface))]">รายละเอียดแบทช์</h1>
              <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">
                ตรวจสอบแถวที่จัดเตรียม แก้ไขความไม่ตรงกันในที่เดียว และยืนยันแบทช์เมื่อทุกอย่างเรียบร้อย
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {batch && batch.status === 'PENDING' ? (
              batch.invalidRows > 0 || batch.warningRows > 0 ? (
                <span title="ต้องแก้ไขแถวที่มีปัญหาก่อนจึงจะยืนยันแบทช์ได้" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-semibold text-[hsl(var(--on-surface))]/30 cursor-not-allowed">
                  {executing ? 'กำลังนำเข้า...' : 'ยืนยันแบทช์'}
                </span>
              ) : (
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_20px_rgba(99,102,241,0.15)] transition-all hover:bg-[hsl(var(--primary))]/90 active:scale-[0.98]"
                  disabled={executing}
                >
                  {executing ? 'กำลังนำเข้า...' : 'ยืนยันแบทช์'}
                </button>
              )
            ) : null}
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[hsl(var(--on-surface))]/40">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          กำลังโหลดรายละเอียดแบทช์...
        </div>
      ) : !batch ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileSpreadsheet className="h-10 w-10 text-[hsl(var(--on-surface))]/20" />
          <div className="font-semibold text-[hsl(var(--on-surface))]">ไม่พบแบทช์</div>
        </div>
      ) : (
        <>
          {/* Stats grid */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">ชื่อไฟล์</div>
              <div className="mt-2 text-sm font-medium text-[hsl(var(--on-surface))]">{batch.filename}</div>
            </div>
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">สถานะ</div>
              <div className="mt-2">
                <span className={statusBadge(batch.status)}>{batch.status}</span>
              </div>
            </div>
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">จำนวนแถว</div>
              <div className="mt-2 text-xl font-semibold text-[hsl(var(--on-surface))]">{totals.rowCount}</div>
            </div>
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">ยอดรวมแบทช์</div>
              <div className="mt-2 text-xl font-semibold text-[hsl(var(--on-surface))]">{money(totals.totalAmount)}</div>
            </div>
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">ถูกต้อง / ข้อผิดพลาด</div>
              <div className="mt-2 text-xl font-semibold text-[hsl(var(--on-surface))]">{batch.validRows} / {batch.invalidRows}</div>
            </div>
          </section>

          {/* Main content grid */}
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Rows table */}
            <div className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--color-border))] px-5 py-4">
                <div className="text-sm font-semibold text-[hsl(var(--on-surface))]">แถวที่จัดเตรียม</div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                  {batch.warningRows} เตือน / {batch.invalidRows} ข้อผิดพลาด
                </span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-[hsl(var(--color-surface))]">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">#</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ห้อง</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ชีต</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ยอดรวม</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--on-surface))]/40">ตรวจสอบบันทึก</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[hsl(var(--color-border))]/50">
                    {(batch.rows as BatchRow[]).map((row, idx) => (
                      <tr key={`${row.roomNo}-${idx}`} className="hover:bg-[hsl(var(--color-surface-hover))] transition-colors">
                        <td className="px-4 py-3 text-[hsl(var(--on-surface))]/40">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-[hsl(var(--on-surface))]">{row.roomNo}</td>
                        <td className="px-4 py-3 text-[hsl(var(--on-surface-variant))]">{row.floorSheetName}</td>
                        <td className="px-4 py-3 text-[hsl(var(--on-surface))] font-semibold">{money(row.totalDue)}</td>
                        <td className="px-4 py-3 text-sm">
                          {row.checkNotes ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                              <AlertTriangle className="h-3 w-3" />
                              {row.checkNotes}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <section className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">
                  Billing Period
                </div>
                <div className="mt-3 text-lg font-semibold text-[hsl(var(--on-surface))]">
                  {batch.billingPeriod ? `${String(batch.billingPeriod.month).padStart(2, '0')}/${batch.billingPeriod.year}` : '—'}
                </div>
                <div className="mt-1 text-sm text-[hsl(var(--on-surface))]/40">
                  {batch.billingPeriod?.status ?? '—'}
                </div>
                {batch.billingPeriod ? (
                  <Link href={`/admin/billing/${batch.billingPeriod.id}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-medium text-[hsl(var(--on-surface))] transition-all hover:bg-[hsl(var(--color-surface-hover))] active:scale-[0.98]">
                    Open Billing Cycle
                  </Link>
                ) : null}
              </section>

              <section className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">
                  ผลการนำเข้า
                </div>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--on-surface-variant))]">นำเข้าแล้ว</span>
                    <span className="font-semibold text-emerald-600">{batch.rowsImported}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--on-surface-variant))]">ข้าม</span>
                    <span className="font-semibold text-amber-600">{batch.rowsSkipped}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[hsl(var(--on-surface-variant))]">ข้อผิดพลาด</span>
                    <span className="font-semibold text-red-600">{batch.rowsErrored}</span>
                  </div>
                </div>
              </section>

              <section className="bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] rounded-xl p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--on-surface))]/40">
                  สร้างเมื่อ
                </div>
                <div className="mt-2 text-sm font-medium text-[hsl(var(--on-surface))]">{dateTime(batch.createdAt)}</div>
              </section>

              {batch.warningRows > 0 || batch.invalidRows > 0 ? (
                <section className="bg-[hsl(var(--color-surface))] border border-amber-500/20 rounded-xl p-5">
                  <div className="mb-3 flex items-center gap-2 text-[hsl(var(--on-surface))]">
                    {batch.invalidRows > 0 ? (
                      <XCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <TriangleAlert className="h-4 w-4 text-amber-600" />
                    )}
                    <span className="font-semibold text-amber-600">ต้องตรวจสอบ</span>
                  </div>
                  <p className="text-sm text-[hsl(var(--on-surface-variant))]">
                    แบทช์นี้มี {batch.warningRows} แถวที่ต้องตรวจสอบ และ {batch.invalidRows} แถวที่ต้องแก้ไขก่อน กรุณาแก้ไขไฟล์ต้นฉบับแล้วอัปโหลดใหม่
                  </p>
                </section>
              ) : null}
            </div>
          </section>
        </>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="ยืนยันนำเข้าแบทช์?"
        description={`ยืนยันการนำเข้า ${batch?.totalRows ?? 0} แถว? การดำเนินการนี้จะสร้างบันทึกการเรียกเก็บทั้งหมดในแบทช์`}
        confirmLabel="ยืนยันนำเข้า"
        cancelLabel="ยกเลิก"
        onConfirm={() => { setConfirmOpen(false); void executeBatch(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </main>
  );
}
