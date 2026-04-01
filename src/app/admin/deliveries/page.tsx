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
  RefreshCw,
  Send,
  XCircle,
  ChevronDown,
  ChevronRight,
  Package,
} from 'lucide-react';
import { isLineConfigured } from '@/lib/line/is-configured';

type OrderStatus = 'DRAFT' | 'SENDING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
type ItemStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED' | 'VIEWED';

type DeliveryOrderItem = {
  id: string;
  roomNo: string;
  status: ItemStatus;
  recipientRef: string | null;
  sentAt: string | null;
  errorMessage: string | null;
  tenant: { fullName: string } | null;
};

type DeliveryOrder = {
  id: string;
  channel: string;
  documentType: string;
  description: string | null;
  year: number | null;
  month: number | null;
  status: OrderStatus;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  items?: DeliveryOrderItem[];
};

const ORDER_STATUS: Record<OrderStatus, { cls: string; label: string; icon: typeof Clock }> = {
  DRAFT:     { cls: 'bg-surface-container text-on-surface-variant border-outline-variant/30', label: 'ฉบับร่าง', icon: Clock },
  SENDING:   { cls: 'bg-secondary-container text-on-secondary-container border-secondary/30', label: 'กำลังส่ง', icon: Send },
  COMPLETED: { cls: 'bg-success-container text-on-success-container border-success/30', label: 'เสร็จสิ้น', icon: CheckCircle2 },
  PARTIAL:   { cls: 'bg-warning-container text-on-warning-container border-warning/30', label: 'ส่งบางส่วน', icon: AlertCircle },
  FAILED:    { cls: 'bg-error-container text-on-error-container border-error/30', label: 'ล้มเหลว', icon: XCircle },
};

const ITEM_STATUS: Record<ItemStatus, { cls: string; label: string }> = {
  PENDING:   { cls: 'bg-warning-container text-on-warning-container', label: 'รอส่ง' },
  SENT:      { cls: 'bg-secondary-container text-on-secondary-container', label: 'ส่งแล้ว' },
  DELIVERED: { cls: 'bg-success-container text-on-success-container', label: 'ส่งสำเร็จ' },
  FAILED:    { cls: 'bg-error-container text-on-error-container', label: 'ล้มเหลว' },
  SKIPPED:   { cls: 'bg-surface-container text-on-surface-variant', label: 'ข้าม' },
  VIEWED:    { cls: 'bg-tertiary-container text-on-tertiary-container', label: 'เปิดแล้ว' },
};

function fmtDate(s: string | null) {
  if (!s) return '-';
  return new Date(s).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtPeriod(year: number | null, month: number | null) {
  if (!year && !month) return '-';
  if (year && month) return `${month}/${year}`;
  return year ? `${year}` : `เดือน ${month}`;
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cfg = ORDER_STATUS[status] ?? ORDER_STATUS.DRAFT;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const cfg = ITEM_STATUS[status] ?? ITEM_STATUS.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export default function DeliveriesPage() {
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, DeliveryOrderItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/delivery-orders?${params}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'ไม่สามารถโหลดข้อมูล');
      const data = json.data;
      setOrders(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  async function toggleExpand(orderId: string) {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    if (itemsMap[orderId]) return;
    setItemsLoading(orderId);
    try {
      const res = await fetch(`/api/delivery-orders/${orderId}`);
      const json = await res.json();
      if (json.success) {
        const items = (json.data.items ?? []).map((item: Record<string, unknown>) => ({
          ...item,
          tenant: item.tenant ? {
            fullName: `${(item.tenant as Record<string, string>).firstName ?? ''} ${(item.tenant as Record<string, string>).lastName ?? ''}`.trim(),
          } : null,
        }));
        setItemsMap((prev) => ({ ...prev, [orderId]: items }));
      }
    } catch {
      toastError('ไม่สามารถโหลดรายการ');
    } finally {
      setItemsLoading(null);
    }
  }

  async function handleSend(orderId: string) {
    setSending(orderId);
    try {
      const res = await fetch(`/api/delivery-orders/${orderId}/send`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'ส่งไม่สำเร็จ');
      success('กำลังส่ง...');
      await load();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    } finally {
      setSending(null);
    }
  }

  async function handleResendItem(orderId: string, itemId: string) {
    try {
      const res = await fetch(`/api/delivery-orders/${orderId}/items/${itemId}/resend`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? 'ส่งซ้ำไม่สำเร็จ');
      success('กำลังส่งซ้ำ...');
      setItemsMap((prev) => {
        const items = prev[orderId] ?? [];
        return { ...prev, [orderId]: items.map((i) => i.id === itemId ? { ...i, status: 'PENDING' as ItemStatus } : i) };
      });
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'ส่งซ้ำไม่สำเร็จ');
    }
  }

  return (
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-on-primary">รายการส่ง LINE</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">ติดตามสถานะการส่งเอกสารผ่าน LINE</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/documents" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
              เอกสาร
            </Link>
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-error-container bg-error-container/20 px-4 py-3 text-sm text-on-error-container">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
          <div className="text-sm font-semibold text-on-surface">รายการ Delivery Orders ({total})</div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-on-surface-variant" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
            >
              <option value="">ทุกสถานะ</option>
              <option value="DRAFT">ฉบับร่าง</option>
              <option value="SENDING">กำลังส่ง</option>
              <option value="COMPLETED">เสร็จสิ้น</option>
              <option value="PARTIAL">ส่งบางส่วน</option>
              <option value="FAILED">ล้มเหลว</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-10">
            <Loader2 className="h-8 w-8 animate-spin text-on-surface-variant" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-on-surface-variant">
            <Package className="h-8 w-8 opacity-40" />
            <div>ไม่พบรายการ Delivery Orders</div>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant">
            {orders.map((order) => (
              <div key={order.id}>
                <button
                  onClick={() => void toggleExpand(order.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-container transition-colors"
                >
                  <span className="text-on-surface-variant">
                    {expandedId === order.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-on-surface">{order.documentType}</span>
                      {order.year || order.month ? (
                        <span className="text-xs text-on-surface-variant">{fmtPeriod(order.year, order.month)}</span>
                      ) : null}
                      {order.description ? (
                        <span className="text-xs text-on-surface-variant truncate max-w-[200px]">{order.description}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-on-surface-variant">{fmtDate(order.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-on-surface-variant">{order.sentCount}/{order.totalCount} ส่งแล้ว</span>
                    <OrderStatusBadge status={order.status} />
                    {(order.status === 'DRAFT') && (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!isLineConfigured()) { toastError('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งได้'); return; } void handleSend(order.id); }}
                        disabled={sending === order.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                      >
                        {sending === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        ส่ง
                      </button>
                    )}
                  </div>
                </button>

                {expandedId === order.id && (
                  <div className="border-t border-outline-variant bg-surface-container/30 px-4 py-3">
                    {itemsLoading === order.id ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
                      </div>
                    ) : (
                      <div className="overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-on-surface-variant">
                              <th className="pb-2 pr-4 font-medium">ห้อง</th>
                              <th className="pb-2 pr-4 font-medium">ผู้เช่า</th>
                              <th className="pb-2 pr-4 font-medium">สถานะ</th>
                              <th className="pb-2 pr-4 font-medium">LINE ID</th>
                              <th className="pb-2 pr-4 font-medium">วันที่ส่ง</th>
                              <th className="pb-2 font-medium">ข้อผิดพลาด</th>
                              <th className="pb-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/40">
                            {(itemsMap[order.id] ?? []).map((item) => (
                              <tr key={item.id}>
                                <td className="py-1.5 pr-4 font-semibold text-on-surface">{item.roomNo}</td>
                                <td className="py-1.5 pr-4 text-on-surface-variant">{item.tenant?.fullName ?? '-'}</td>
                                <td className="py-1.5 pr-4">
                                  <ItemStatusBadge status={item.status as ItemStatus} />
                                </td>
                                <td className="py-1.5 pr-4 font-mono text-on-surface-variant truncate max-w-[120px]">{item.recipientRef ?? '-'}</td>
                                <td className="py-1.5 pr-4 text-on-surface-variant">{fmtDate(item.sentAt)}</td>
                                <td className="py-1.5 pr-4 max-w-[180px] truncate text-error">{item.errorMessage ?? '-'}</td>
                                <td className="py-1.5">
                                  {item.status === 'FAILED' && (
                                    <button
                                      onClick={() => { if (!isLineConfigured()) { toastError('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งซ้ำได้'); return; } void handleResendItem(order.id, item.id); }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-2 py-1 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                                    >
                                      <RefreshCw className="h-3 w-3" />
                                      Retry
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-outline-variant px-4 py-3">
            <span className="text-sm text-on-surface-variant">หน้า {page} จาก {totalPages} ({total} รายการ)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-50">
                ก่อนหน้า
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container disabled:opacity-50">
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
