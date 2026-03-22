'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  XCircle,
} from 'lucide-react';

type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'VIEWED';

type Delivery = {
  id: string;
  invoiceId: string;
  channel: string;
  status: DeliveryStatus;
  recipientRef: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    roomNo: string;
    year: number;
    month: number;
    totalAmount: string;
    status: string;
    room: {
      roomNo: string;
      floorNo: number;
    } | null;
  } | null;
};

type DeliveryListResponse = {
  items: Delivery[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const STATUS_CONFIG: Record<DeliveryStatus, { cls: string; label: string; icon: typeof Clock }> = {
  PENDING: { cls: 'bg-warning-container text-on-warning-container border-warning/30', label: 'รอส่ง', icon: Clock },
  SENT: { cls: 'bg-secondary-container text-on-secondary-container border-secondary/30', label: 'ส่งแล้ว', icon: Send },
  DELIVERED: { cls: 'bg-success-container text-on-success-container border-success/30', label: 'ส่งสำเร็จ', icon: CheckCircle2 },
  FAILED: { cls: 'bg-error-container text-on-error-container border-error/30', label: 'ล้มเหลว', icon: XCircle },
  VIEWED: { cls: 'bg-tertiary-container text-on-tertiary-container border-tertiary/30', label: 'เปิดแล้ว', icon: MessageSquare },
};

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${config.cls}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function money(amount: string): string {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(parseFloat(amount));
}

export default function DeliveriesPage() {
  const { success, error: toastError } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [resending, setResending] = useState<string | null>(null);

  const pageSize = 50;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        channel: 'LINE',
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/deliveries?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'Failed to load');
      const data = json.data as DeliveryListResponse;
      setDeliveries(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function handleResend(id: string) {
    setResending(id);
    try {
      const res = await fetch(`/api/deliveries/${id}/resend`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'Resend failed');
      success('ส่งใหม่สำเร็จแล้ว');
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'ส่งใหม่ไม่สำเร็จ');
    } finally {
      setResending(null);
    }
  }

  const stats = {
    pending: deliveries.filter((d) => d.status === 'PENDING').length,
    sent: deliveries.filter((d) => d.status === 'SENT').length,
    delivered: deliveries.filter((d) => d.status === 'DELIVERED').length,
    viewed: deliveries.filter((d) => d.status === 'VIEWED').length,
    failed: deliveries.filter((d) => d.status === 'FAILED').length,
  };

  return (
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-on-primary">LINE Delivery</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">
              ติดตามสถานะการส่งใบแจ้งหนี้ผ่าน LINE
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/documents" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
              ไปที่ Documents
            </Link>
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="auth-alert auth-alert-error flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-4">
          <div className="text-xs text-on-surface-variant font-medium">รอส่ง</div>
          <div className="text-xl font-semibold text-on-surface">{stats.pending}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-4">
          <div className="text-xs text-on-surface-variant font-medium">ส่งแล้ว</div>
          <div className="text-xl font-semibold text-on-surface">{stats.sent}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-4">
          <div className="text-xs text-on-surface-variant font-medium">ส่งสำเร็จ</div>
          <div className="text-xl font-semibold text-on-surface">{stats.delivered}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-4">
          <div className="text-xs text-on-surface-variant font-medium">เปิดแล้ว</div>
          <div className="text-xl font-semibold text-on-surface">{stats.viewed}</div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden p-4">
          <div className="text-xs text-on-surface-variant font-medium">ล้มเหลว</div>
          <div className="text-xl font-semibold text-on-surface">{stats.failed}</div>
        </div>
      </div>

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
          <div className="text-sm font-semibold text-on-surface">รายการส่ง LINE</div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-on-surface-variant" />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              >
                <option value="">ทุกสถานะ</option>
                <option value="PENDING">รอส่ง</option>
                <option value="SENT">ส่งแล้ว</option>
                <option value="DELIVERED">ส่งสำเร็จ</option>
                <option value="VIEWED">เปิดแล้ว</option>
                <option value="FAILED">ล้มเหลว</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-10">
            <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="p-10 text-center text-on-surface-variant">
            ไม่พบรายการส่ง LINE
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-lowest">
                <tr>
                  <th>ห้อง</th>
                  <th>เดือน</th>
                  <th>ยอด</th>
                  <th>สถานะ</th>
                  <th>วันที่ส่ง</th>
                  <th>เปิดเมื่อ</th>
                  <th>Error</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="font-semibold">{d.invoice?.room?.roomNo ?? '-'}</td>
                    <td>
                      {d.invoice
                        ? `${d.invoice.month}/${d.invoice.year}`
                        : '-'}
                    </td>
                    <td>{d.invoice ? money(d.invoice.totalAmount) : '-'}</td>
                    <td>
                      <StatusBadge status={d.status as DeliveryStatus} />
                    </td>
                    <td className="text-on-surface-variant">{fmtDate(d.sentAt)}</td>
                    <td className="text-on-surface-variant">{fmtDate(d.viewedAt)}</td>
                    <td className="max-w-[200px] truncate text-red-600">
                      {d.errorMessage ?? '-'}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {d.status === 'FAILED' && (
                          <button
                            onClick={() => void handleResend(d.id)}
                            disabled={resending === d.id}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          >
                            {resending === d.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Retry
                          </button>
                        )}
                        {d.invoice && (
                          <Link
                            href={`/admin/documents?invoice=${d.invoice.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-outline bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          >
                            เอกสาร
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-outline-variant px-4 py-3">
            <span className="text-sm text-on-surface-variant">
              หน้า {page} จาก {totalPages} ({total} รายการ)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
              >
                ก่อนหน้า
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
