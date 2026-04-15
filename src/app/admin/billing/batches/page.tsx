'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BatchStatus | 'ALL'>('ALL');
  const queryClient = useQueryClient();

  const { data: batchesData, isLoading: loading, error, refetch } = useQuery<{ success: boolean; data: { batches: ImportBatch[] } }>({
    queryKey: ['billing-batches', status],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (status !== 'ALL') params.set('status', status);
      const response = await fetch(`/api/billing/import/batches?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error?.message ?? 'ไม่สามารถโหลดแบทช์นำเข้า');
      }
      return json;
    },
  });

  const batches: ImportBatch[] = batchesData?.data?.batches ?? [];

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
            <h1 className="text-base font-semibold text-on-primary">แบทช์นำเข้าการเรียกเก็บ</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">
              ทุกเวิร์กบุ๊กจะถูกจัดเตรียมที่นี่ก่อน ตรวจสอบทีละแถว แล้วจึงยืนยันเป็นบันทึกการเรียกเก็บจริง
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/billing/import" className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-white/30">
              นำเข้าใหม่
            </Link>
            <button onClick={() => void refetch()} className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/20 px-4 py-2 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-white/30" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg border border-error-container bg-error-container/20 px-4 py-3 text-sm font-medium text-on-error-container">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">แบทช์ทั้งหมด</div>
          <div className="text-2xl font-extrabold text-primary">{stats.total}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">นำเข้าแล้ว</div>
          <div className="text-2xl font-extrabold text-primary text-emerald-600">{stats.imported}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ต้องตรวจสอบ</div>
          <div className="text-2xl font-extrabold text-primary text-amber-600">{stats.needsReview}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">นำเข้าล่าสุด</div>
          <div className="mt-2 text-sm font-medium text-on-surface">{formatDate(stats.latestImportedAt)}</div>
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-outline-variant">
          <div className="text-sm font-semibold text-primary">คลังแบทช์</div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาแบทช์ ชื่อไฟล์ รอบ..."
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
                  {option === 'ALL' ? 'ทุกสถานะ' : option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            กำลังโหลดแบทช์นำเข้า...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FileSpreadsheet className="h-10 w-10 text-on-surface-variant" />
            <div>
              <div className="font-semibold text-on-surface">ไม่พบแบทช์นำเข้า</div>
              <div className="text-sm text-on-surface-variant">อัปโหลดเวิร์กบุ๊กแรกเพื่อเริ่มจัดเตรียมการเรียกเก็บรายเดือน</div>
            </div>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-surface-container">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">แบทช์</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">รอบ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">แถว</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">เตือน / ข้อผิดพลาด</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">นำเข้าเมื่อ</th>
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
                      <div className="mt-1 text-xs text-on-surface-variant">สร้างเมื่อ {formatDate(batch.createdAt)}</div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        {batch.billingCycle ? (
                          <Link href={`/admin/billing/${batch.billingCycle.id}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container text-xs">
                            รอบ
                          </Link>
                        ) : null}
                        <Link href={`/admin/billing/batches/${batch.id}`} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container text-xs">
                          รายละเอียด
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
            <span className="font-semibold">จัดเตรียมก่อนยืนยัน</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            เวิร์กบุ๊กที่อัปโหลดจะไปที่การจัดเตรียมก่อน พนักงานสามารถตรวจสอบยอดรวมและการจับคู่ห้องก่อนที่จะมีผลกับบันทึกการเรียกเก็บจริง
          </p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="mb-3 flex items-center gap-2 text-on-surface">
            <TriangleAlert className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">การเตือนยังคงแสดง</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            ความไม่ตรงกันของ TotalAmount และปัญหาการตรวจสอบยังคงอยู่กับแบทช์ เพื่อให้ร่องรอยการตรวจสอบไม่หายไปหลังจากการนำเข้ารายเดือนเสร็จสิ้น
          </p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="mb-3 flex items-center gap-2 text-on-surface">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="font-semibold">ลิงก์การนำเข้าสามารถตรวจสอบย้อนได้</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            ทุกแบทช์ที่ยืนยันจะเก็บการอ้างอิงถึงบันทึกการเรียกเก็บที่สร้าง เพื่อให้ฝ่ายการเงินสามารถตรวจสอบได้ว่าแถวใดในเวิร์กบุ๊กสร้างบิลห้องใด
          </p>
        </div>
      </section>
    </main>
  );
}
