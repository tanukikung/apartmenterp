'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { statusBadgeClassWithBorder } from '@/lib/status-colors';

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
  if (status === 'IMPORTED') return `inline-flex items-center gap-1 ${statusBadgeClassWithBorder('success')}`;
  if (status === 'FAILED') return `inline-flex items-center gap-1 ${statusBadgeClassWithBorder('danger')}`;
  if (status === 'VALIDATED') return `inline-flex items-center gap-1 ${statusBadgeClassWithBorder('warning')}`;
  return `inline-flex items-center gap-1 ${statusBadgeClassWithBorder('neutral')}`;
}

export default function BillingBatchesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BatchStatus | 'ALL'>('ALL');

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
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[hsl(var(--primary))]/20 to-[hsl(var(--primary))]/5 backdrop-blur border border-[hsl(var(--color-border))] px-6 py-5 shadow-[var(--glow-primary)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.08),_transparent_60%)]" />
        <div className="relative flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[hsl(var(--color-text))]">แบทช์นำเข้าการเรียกเก็บ</h1>
            <p className="text-xs text-[hsl(var(--color-text))/50] mt-0.5">
              ทุกเวิร์กบุ๊กจะถูกจัดเตรียมที่นี่ก่อน ตรวจสอบทีละแถว แล้วจึงยืนยันเป็นบันทึกการเรียกเก็บจริง
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/billing/import" className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/50 backdrop-blur px-4 py-2 text-sm font-semibold text-[hsl(var(--color-text))/80] shadow-sm transition-all hover:bg-[hsl(var(--color-surface))/70] hover:border-[hsl(var(--color-border))/20] active:scale-[0.98]">
              นำเข้าใหม่
            </Link>
            <button onClick={() => void refetch()} className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/50 backdrop-blur px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))/70] shadow-sm transition-all hover:bg-[hsl(var(--color-surface))/70] hover:border-[hsl(var(--color-border))/20] active:scale-[0.98]" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 font-medium backdrop-blur">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      {/* Stats grid */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">แบทช์ทั้งหมด</div>
          <div className="text-2xl font-extrabold text-[hsl(var(--color-text))]">{stats.total}</div>
        </div>
        <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">นำเข้าแล้ว</div>
          <div className="text-2xl font-extrabold text-emerald-600">{stats.imported}</div>
        </div>
        <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">ต้องตรวจสอบ</div>
          <div className="text-2xl font-extrabold text-amber-600">{stats.needsReview}</div>
        </div>
        <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">นำเข้าล่าสุด</div>
          <div className="mt-2 text-sm font-medium text-[hsl(var(--color-text))/70]">{formatDate(stats.latestImportedAt)}</div>
        </div>
      </section>

      {/* Table */}
      <section className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[hsl(var(--color-border))]">
          <div className="text-sm font-semibold text-[hsl(var(--color-primary-light))]">คลังแบทช์</div>
          <div className="flex items-center gap-2 mt-2">
            <label className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--color-text))/30]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาแบทช์ ชื่อไฟล์ รอบ..."
                className="w-full rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur pl-9 pr-3 py-2.5 text-sm text-[hsl(var(--color-text))] placeholder:text-[hsl(var(--color-text))/30 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as BatchStatus | 'ALL')}
              className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] backdrop-blur px-3 py-2.5 text-sm text-[hsl(var(--color-text))/80 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
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
          <div className="flex items-center justify-center py-16 text-[hsl(var(--color-text))/40">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            กำลังโหลดแบทช์นำเข้า...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FileSpreadsheet className="h-10 w-10 text-[hsl(var(--color-text))/20" />
            <div>
              <div className="font-semibold text-[hsl(var(--color-text))/80]">ไม่พบแบทช์นำเข้า</div>
              <div className="text-sm text-[hsl(var(--color-text))/40]">อัปโหลดเวิร์กบุ๊กแรกเพื่อเริ่มจัดเตรียมการเรียกเก็บรายเดือน</div>
            </div>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-[hsl(var(--color-surface))/50">
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">แบทช์</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">รอบ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">สถานะ</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">แถว</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">เตือน / ข้อผิดพลาด</th>
                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--color-text))/40]">นำเข้าเมื่อ</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--color-border))/5]">
                {filtered.map((batch) => (
                  <tr key={batch.id} className="hover:bg-[hsl(var(--color-surface))/30] transition-colors">
                    <td>
                      <div className="font-medium text-[hsl(var(--color-text))/90]">{batch.sourceFilename}</div>
                      <div className="mt-1 font-mono text-[11px] text-[hsl(var(--color-text))/40]">{batch.id}</div>
                    </td>
                    <td>
                      {batch.billingCycle ? (
                        <div>
                          <div className="font-semibold text-[hsl(var(--color-text))/90]">
                            {monthLabel(batch.billingCycle.month, batch.billingCycle.year)}
                          </div>
                          <div className="text-xs text-[hsl(var(--color-text))/40]">
                            {batch.billingCycle.building?.name ?? 'Main building'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[hsl(var(--color-text))/30]">—</span>
                      )}
                    </td>
                    <td>
                      <span className={statusBadge(batch.status)}>{batch.status}</span>
                    </td>
                    <td>
                      <div className="font-semibold text-[hsl(var(--color-text))/90]">{batch.totalRows}</div>
                      <div className="text-xs text-[hsl(var(--color-text))/40]">{batch.validRows} ready rows</div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          {batch.warningRows}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          {batch.invalidRows}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-[hsl(var(--color-text))/70]">{formatDate(batch.importedAt)}</div>
                      <div className="mt-1 text-xs text-[hsl(var(--color-text))/30]">สร้างเมื่อ {formatDate(batch.createdAt)}</div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        {batch.billingCycle ? (
                          <Link href={`/admin/billing/${batch.billingCycle.id}`} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/50 backdrop-blur px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-text))/70] transition-all hover:bg-[hsl(var(--color-surface))/70] hover:border-[hsl(var(--color-border))/20] active:scale-[0.98]">
                            รอบ
                          </Link>
                        ) : null}
                        <Link href={`/admin/billing/batches/${batch.id}`} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]/50 backdrop-blur px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-text))/70] transition-all hover:bg-[hsl(var(--color-surface))/70] hover:border-[hsl(var(--color-border))/20] active:scale-[0.98]">
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

      {/* Info cards */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-5">
          <div className="mb-3 flex items-center gap-2 text-[hsl(var(--color-text))]">
            <Clock3 className="h-4 w-4 text-[hsl(var(--color-primary-light))]" />
            <span className="font-semibold">จัดเตรียมก่อนยืนยัน</span>
          </div>
          <p className="text-sm text-[hsl(var(--color-text))/50]">
            เวิร์กบุ๊กที่อัปโหลดจะไปที่การจัดเตรียมก่อน พนักงานสามารถตรวจสอบยอดรวมและการจับคู่ห้องก่อนที่จะมีผลกับบันทึกการเรียกเก็บจริง
          </p>
        </div>
        <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-5">
          <div className="mb-3 flex items-center gap-2 text-[hsl(var(--color-text))]">
            <TriangleAlert className="h-4 w-4 text-amber-600" />
            <span className="font-semibold">การเตือนยังคงแสดง</span>
          </div>
          <p className="text-sm text-[hsl(var(--color-text))/50]">
            ความไม่ตรงกันของ TotalAmount และปัญหาการตรวจสอบยังคงอยู่กับแบทช์ เพื่อให้ร่องรอยการตรวจสอบไม่หายไปหลังจากการนำเข้ารายเดือนเสร็จสิ้น
          </p>
        </div>
        <div className="bg-[hsl(var(--color-surface))] backdrop-blur border border-[hsl(var(--color-border))] rounded-xl p-5">
          <div className="mb-3 flex items-center gap-2 text-[hsl(var(--color-text))]">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold">ลิงก์การนำเข้าสามารถตรวจสอบย้อนได้</span>
          </div>
          <p className="text-sm text-[hsl(var(--color-text))/50]">
            ทุกแบทช์ที่ยืนยันจะเก็บการอ้างอิงถึงบันทึกการเรียกเก็บที่สร้าง เพื่อให้ฝ่ายการเงินสามารถตรวจสอบได้ว่าแถวใดในเวิร์กบุ๊กสร้างบิลห้องใด
          </p>
        </div>
      </section>
    </main>
  );
}
