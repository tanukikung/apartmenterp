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
  if (status === 'COMPLETED') return 'inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700';
  if (status === 'FAILED') return 'inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-600';
  if (status === 'PROCESSING') return 'inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700';
  return 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600';
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
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/billing/batches" className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30">
              <ArrowLeft className="h-4 w-4" />
              กลับ
            </Link>
            <div>
              <h1 className="text-base font-semibold text-on-primary">รายละเอียดแบทช์</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">
                ตรวจสอบแถวที่จัดเตรียม แก้ไขความไม่ตรงกันในที่เดียว และยืนยันแบทช์เมื่อทุกอย่างเรียบร้อย
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {batch && batch.status === 'PENDING' ? (
              batch.invalidRows > 0 || batch.warningRows > 0 ? (
                <span title="ต้องแก้ไขแถวที่มีปัญหาก่อนจึงจะยืนยันแบทช์ได้" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/40 cursor-not-allowed">
                  {executing ? 'กำลังนำเข้า...' : 'ยืนยันแบทช์'}
                </span>
              ) : (
                <button
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-white/30"
                  disabled={executing}
                >
                  {executing ? 'กำลังนำเข้า...' : 'ยืนยันแบทช์'}
                </button>
              )
            ) : null}
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className="auth-alert auth-alert-success flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-on-surface-variant">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          กำลังโหลดรายละเอียดแบทช์...
        </div>
      ) : !batch ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileSpreadsheet className="h-10 w-10 text-on-surface-variant" />
          <div className="font-semibold text-on-surface">ไม่พบแบทช์</div>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">ชื่อไฟล์</div>
              <div className="mt-2 text-sm font-medium text-on-surface">{batch.filename}</div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">สถานะ</div>
              <div className="mt-2">
                <span className={statusBadge(batch.status)}>{batch.status}</span>
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">จำนวนแถว</div>
              <div className="mt-2 text-xl font-semibold text-on-surface">{totals.rowCount}</div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">ยอดรวมแบทช์</div>
              <div className="mt-2 text-xl font-semibold text-on-surface">{money(totals.totalAmount)}</div>
            </div>
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">ถูกต้อง / ข้อผิดพลาด</div>
              <div className="mt-2 text-xl font-semibold text-on-surface">{batch.validRows} / {batch.invalidRows}</div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
                <div className="text-sm font-semibold text-on-surface">แถวที่จัดเตรียม</div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  {batch.warningRows} เตือน / {batch.invalidRows} ข้อผิดพลาด
                </span>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-surface-container">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">#</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ชีต</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ยอดรวม</th>
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ตรวจสอบบันทึก</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {(batch.rows as BatchRow[]).map((row, idx) => (
                      <tr key={`${row.roomNo}-${idx}`} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="px-4 py-3 text-on-surface-variant">{idx + 1}</td>
                        <td className="px-4 py-3 font-semibold text-on-surface">{row.roomNo}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{row.floorSheetName}</td>
                        <td className="px-4 py-3 text-on-surface">{money(row.totalDue)}</td>
                        <td className="px-4 py-3 text-sm text-on-surface-variant">
                          {row.checkNotes ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              {row.checkNotes}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
                  Billing Period
                </div>
                <div className="mt-3 text-lg font-semibold text-on-surface">
                  {batch.billingPeriod ? `${String(batch.billingPeriod.month).padStart(2, '0')}/${batch.billingPeriod.year}` : '—'}
                </div>
                <div className="mt-1 text-sm text-on-surface-variant">
                  {batch.billingPeriod?.status ?? '—'}
                </div>
                {batch.billingPeriod ? (
                  <Link href={`/admin/billing/${batch.billingPeriod.id}`} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
                    Open Billing Cycle
                  </Link>
                ) : null}
              </section>

              <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
                  ผลการนำเข้า
                </div>
                <div className="mt-3 space-y-3 text-sm text-on-surface-variant">
                  <div className="flex justify-between">
                    <span>นำเข้าแล้ว</span>
                    <span className="font-semibold text-on-surface">{batch.rowsImported}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ข้าม</span>
                    <span className="font-semibold text-on-surface">{batch.rowsSkipped}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ข้อผิดพลาด</span>
                    <span className="font-semibold text-on-surface">{batch.rowsErrored}</span>
                  </div>
                </div>
              </section>

              <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
                  สร้างเมื่อ
                </div>
                <div className="mt-2 text-sm font-medium text-on-surface">{dateTime(batch.createdAt)}</div>
              </section>

              {batch.warningRows > 0 || batch.invalidRows > 0 ? (
                <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
                  <div className="mb-3 flex items-center gap-2 text-on-surface">
                    {batch.invalidRows > 0 ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <TriangleAlert className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="font-semibold">ต้องตรวจสอบ</span>
                  </div>
                  <p className="text-sm text-on-surface-variant">
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
