'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Send,
  XCircle,
  ChevronDown,
  ChevronRight,
  Package,
} from 'lucide-react';
import { isLineConfigured } from '@/lib/line/is-configured';
import { useApiData } from '@/hooks/useApi';
import { SkeletonTable } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { BulkActions } from '@/components/ui/bulk-actions';
import { useUrlState } from '@/hooks/useUrlState';
import { motion } from 'framer-motion';

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

const ORDER_STATUS: Record<OrderStatus, { bg: string; text: string; border: string; label: string; icon: typeof Clock }> = {
  DRAFT:     { bg: 'hsl(var(--color-surface)/0.1)', text: 'hsl(var(--on-surface-variant))', border: 'hsl(var(--color-border)/0.2)', label: 'ฉบับร่าง', icon: Clock },
  SENDING:   { bg: 'hsl(var(--primary) / 0.15)', text: 'hsl(var(--color-primary-light))', border: 'hsl(var(--primary) / 0.3)', label: 'กำลังส่ง', icon: Send },
  COMPLETED: { bg: 'hsl(var(--emerald) / 0.15)', text: 'hsl(var(--emerald))', border: 'hsl(var(--emerald) / 0.3)', label: 'เสร็จสิ้น', icon: CheckCircle2 },
  PARTIAL:   { bg: 'hsl(var(--amber) / 0.15)', text: 'hsl(var(--amber))', border: 'hsl(var(--amber) / 0.3)', label: 'ส่งบางส่วน', icon: AlertCircle },
  FAILED:    { bg: 'hsl(var(--red) / 0.15)', text: 'hsl(var(--red))', border: 'hsl(var(--red) / 0.3)', label: 'ล้มเหลว', icon: XCircle },
};

const ITEM_STATUS: Record<ItemStatus, { bg: string; text: string; label: string }> = {
  PENDING:   { bg: 'hsl(var(--amber) / 0.15)', text: 'hsl(var(--amber))', label: 'รอดำเนินการ' },
  SENT:      { bg: 'hsl(var(--primary) / 0.15)', text: 'hsl(var(--color-primary-light))', label: 'ส่งแล้ว' },
  DELIVERED: { bg: 'hsl(var(--emerald) / 0.15)', text: 'hsl(var(--emerald))', label: 'ส่งสำเร็จ' },
  FAILED:    { bg: 'hsl(var(--red) / 0.15)', text: 'hsl(var(--red))', label: 'ล้มเหลว' },
  SKIPPED:   { bg: 'hsl(var(--color-surface)/0.1)', text: 'hsl(var(--on-surface-variant))', label: 'ข้าม' },
  VIEWED:    { bg: 'hsl(var(--violet) / 0.15)', text: 'hsl(var(--violet))', label: 'อ่านแล้ว' },
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
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const cfg = ITEM_STATUS[status] ?? ITEM_STATUS.PENDING;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  );
}

export default function DeliveriesPage() {
  const { success, error: toastError } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useUrlState('status', '');
  const [search, setSearch] = useUrlState('q', '');
  const [searchDebounced, setSearchDebounced] = useState(search);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, DeliveryOrderItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [selectedFailedItems, setSelectedFailedItems] = useState<Set<string>>(new Set());
  const [bulkResending, setBulkResending] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkSendingOrders, setBulkSendingOrders] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const pageSize = 20;

  const ordersUrl = (() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (statusFilter) params.set('status', statusFilter);
    if (searchDebounced) params.set('q', searchDebounced);
    return `/api/delivery-orders?${params.toString()}`;
  })();

  const { data: ordersData, isLoading, error: fetchError, refetch } = useApiData<{ success: boolean; data: { data: DeliveryOrder[]; total: number; totalPages: number } }>(ordersUrl, ['delivery-orders', String(page), statusFilter, searchDebounced]);

  const orders: DeliveryOrder[] = ordersData?.data?.data ?? [];
  const total = ordersData?.data?.total ?? 0;
  const totalPages = ordersData?.data?.totalPages ?? 1;

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
      void refetch();
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

  async function handleBulkResend(orderId: string) {
    if (!isLineConfigured()) {
      toastError('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งซ้ำได้');
      return;
    }
    setBulkResending(true);
    const ids = Array.from(selectedFailedItems);
    let ok = 0;
    let fail = 0;
    for (const itemId of ids) {
      try {
        const res = await fetch(`/api/delivery-orders/${orderId}/items/${itemId}/resend`, { method: 'POST' });
        const json = await res.json();
        if (json.success) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setBulkResending(false);
    setSelectedFailedItems(new Set());
    setItemsMap((prev) => {
      const items = prev[orderId] ?? [];
      return { ...prev, [orderId]: items.map((i) => ids.includes(i.id) ? { ...i, status: 'PENDING' as ItemStatus } : i) };
    });
    if (ok > 0) success(`กำลังส่งซ้ำ ${ok} รายการ`);
    if (fail > 0) toastError(`ส่งซ้ำไม่สำเร็จ ${fail} รายการ`);
  }

  function toggleFailedItem(id: string) {
    setSelectedFailedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleOrder(id: string) {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllDrafts() {
    const draftIds = orders.filter((o) => o.status === 'DRAFT').map((o) => o.id);
    const allSelected = draftIds.length > 0 && draftIds.every((id) => selectedOrders.has(id));
    if (allSelected) setSelectedOrders(new Set());
    else setSelectedOrders(new Set(draftIds));
  }

  async function handleBulkSendOrders() {
    if (!isLineConfigured()) {
      toastError('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งได้');
      return;
    }
    const ids = Array.from(selectedOrders);
    if (ids.length === 0) return;
    setBulkSendingOrders(true);
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/delivery-orders/${id}/send`, { method: 'POST' });
        const json = await res.json();
        if (json.success) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setBulkSendingOrders(false);
    setSelectedOrders(new Set());
    if (ok > 0) success(`กำลังส่ง ${ok} รายการ`);
    if (fail > 0) toastError(`ส่งไม่สำเร็จ ${fail} รายการ`);
    void refetch();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-[hsl(var(--glass-border))] glass-card px-6 py-5">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 opacity-20" style={{ background: 'linear-gradient(135deg, hsl(217 100% 67% / 0.2) 0%, transparent 60%)' }} />
        </div>
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-[hsl(var(--card-foreground))]">รายการส่ง LINE</h1>
            <p className="text-xs text-[hsl(var(--on-surface-variant))] mt-0.5">ติดตามสถานะการส่งเอกสารผ่าน LINE</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin/documents" className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--color-surface))]/[0.05]">
              เอกสาร
            </Link>
            <button onClick={() => void refetch()} className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--color-surface))]/[0.05]">
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          <AlertCircle className="h-4 w-4" />
          {fetchError instanceof Error ? fetchError.message : String(fetchError)}
        </div>
      )}

      <BulkActions
        count={selectedOrders.size}
        onClear={() => setSelectedOrders(new Set())}
        actions={[
          {
            label: bulkSendingOrders ? 'กำลังส่ง...' : 'ส่งที่เลือก',
            icon: <Send className="h-3.5 w-3.5" />,
            onClick: () => void handleBulkSendOrders(),
          },
        ]}
      />

      <BulkActions
        count={selectedFailedItems.size}
        onClear={() => setSelectedFailedItems(new Set())}
        actions={[
          {
            label: bulkResending ? 'กำลังส่งซ้ำ...' : 'ส่งซ้ำที่เลือก',
            icon: <RefreshCw className="h-3.5 w-3.5" />,
            onClick: () => { if (expandedId) void handleBulkResend(expandedId); },
          },
        ]}
      />

      <section className="rounded-xl border border-[hsl(var(--glass-border))] glass-card overflow-hidden">
        <div className="flex flex-col gap-3 px-4 py-3 border-b border-[hsl(var(--glass-border))] md:flex-row md:items-center md:justify-between" style={{ background: 'hsl(var(--card))' }}>
          <div className="text-sm font-semibold text-[hsl(var(--card-foreground))]">รายการ Delivery Orders ({total})</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--on-surface-variant))]" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="ค้นหา..."
                aria-label="ค้นหา"
                className="w-full rounded-lg border border-[hsl(var(--glass-border))] glass-card py-2 pl-9 pr-3 text-sm text-[hsl(var(--card-foreground))] placeholder:text-[hsl(var(--on-surface-variant))]/50 focus:border-[hsl(var(--primary))]/50 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/20"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[hsl(var(--on-surface-variant))]" />
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                aria-label="กรองตามสถานะ"
                className="rounded-lg border border-[hsl(var(--glass-border))] glass-card px-3 py-2 text-sm text-[hsl(var(--card-foreground))]"
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
        </div>

        {isLoading ? (
          <div className="p-5">
            <SkeletonTable rows={6} />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<Package className="h-7 w-7" />}
            title="ไม่พบรายการ Delivery Orders"
            description={searchDebounced || statusFilter ? 'ลองปรับคำค้นหาหรือล้างตัวกรอง' : 'ยังไม่มีรายการส่ง LINE'}
            action={(searchDebounced || statusFilter) ? { label: 'ล้างตัวกรอง', onClick: () => { setSearch(''); setStatusFilter(''); setPage(1); } } : undefined}
          />
        ) : (
          <div className="divide-y divide-[hsl(var(--glass-border))]">
            {orders.some((o) => o.status === 'DRAFT') && (
              <div className="flex items-center gap-3 px-4 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <input
                  type="checkbox"
                  aria-label="เลือกฉบับร่างทั้งหมด"
                  checked={(() => {
                    const drafts = orders.filter((o) => o.status === 'DRAFT');
                    return drafts.length > 0 && drafts.every((o) => selectedOrders.has(o.id));
                  })()}
                  onChange={toggleAllDrafts}
                  className="h-4 w-4 rounded border-[hsl(var(--glass-border))] accent-[hsl(var(--primary))]"
                />
                <span className="text-xs text-[hsl(var(--on-surface-variant))]">เลือกฉบับร่างทั้งหมดเพื่อส่งเป็นกลุ่ม</span>
              </div>
            )}
            {orders.map((order) => (
              <div key={order.id} className="flex items-start">
                {order.status === 'DRAFT' ? (
                  <div className="pl-4 pt-4">
                    <input
                      type="checkbox"
                      aria-label={`เลือก ${order.documentType}`}
                      checked={selectedOrders.has(order.id)}
                      onChange={() => toggleOrder(order.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-[hsl(var(--glass-border))] accent-[hsl(var(--primary))]"
                    />
                  </div>
                ) : (
                  <div className="pl-4 w-8" />
                )}
                <div className="flex-1 min-w-0">
                <button
                  onClick={() => void toggleExpand(order.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[hsl(var(--color-surface))]/[0.05] transition-colors"
                >
                  <span className="text-[hsl(var(--on-surface-variant))]">
                    {expandedId === order.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[hsl(var(--card-foreground))]">{order.documentType}</span>
                      {order.year || order.month ? (
                        <span className="text-xs text-[hsl(var(--on-surface-variant))]">{fmtPeriod(order.year, order.month)}</span>
                      ) : null}
                      {order.description ? (
                        <span className="text-xs text-[hsl(var(--on-surface-variant))] truncate max-w-[200px]">{order.description}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-xs text-[hsl(var(--on-surface-variant))]">{fmtDate(order.createdAt)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-[hsl(var(--on-surface-variant))]">{order.sentCount}/{order.totalCount} ส่งแล้ว</span>
                    <OrderStatusBadge status={order.status} />
                    {(order.status === 'DRAFT') && (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!isLineConfigured()) { toastError('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งได้'); return; } void handleSend(order.id); }}
                        disabled={sending === order.id}
                        aria-label="ส่งรายการ"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:scale-105 active:scale-95 hover:shadow-glow-primary-hover disabled:opacity-50"
                      >
                        {sending === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        ส่ง
                      </button>
                    )}
                  </div>
                </button>

                {expandedId === order.id && (
                  <div className="border-t border-[hsl(var(--glass-border))] px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {itemsLoading === order.id ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--on-surface-variant))]" />
                      </div>
                    ) : (
                      <div className="overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[hsl(var(--on-surface-variant))]">
                              <th className="pb-2 pr-2 w-6"></th>
                              <th className="pb-2 pr-4 font-medium">ห้อง</th>
                              <th className="hidden md:table-cell pb-2 pr-4 font-medium">ผู้เช่า</th>
                              <th className="pb-2 pr-4 font-medium">สถานะ</th>
                              <th className="hidden lg:table-cell pb-2 pr-4 font-medium">LINE ID</th>
                              <th className="hidden md:table-cell pb-2 pr-4 font-medium">วันที่ส่ง</th>
                              <th className="hidden lg:table-cell pb-2 font-medium">ข้อผิดพลาด</th>
                              <th className="pb-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[hsl(var(--glass-border))]">
                            {(itemsMap[order.id] ?? []).map((item) => (
                              <tr key={item.id}>
                                <td className="py-1.5 pr-2">
                                  {item.status === 'FAILED' && (
                                    <input
                                      type="checkbox"
                                      aria-label={`เลือก ห้อง ${item.roomNo}`}
                                      checked={selectedFailedItems.has(item.id)}
                                      onChange={() => toggleFailedItem(item.id)}
                                    />
                                  )}
                                </td>
                                <td className="py-1.5 pr-4 font-semibold text-[hsl(var(--card-foreground))]">{item.roomNo}</td>
                                <td className="hidden md:table-cell py-1.5 pr-4 text-[hsl(var(--on-surface-variant))]">{item.tenant?.fullName ?? '-'}</td>
                                <td className="py-1.5 pr-4">
                                  <ItemStatusBadge status={item.status as ItemStatus} />
                                </td>
                                <td className="hidden lg:table-cell py-1.5 pr-4 font-mono text-[hsl(var(--on-surface-variant))] truncate max-w-[120px]">{item.recipientRef ?? '-'}</td>
                                <td className="hidden md:table-cell py-1.5 pr-4 text-[hsl(var(--on-surface-variant))]">{fmtDate(item.sentAt)}</td>
                                <td className="hidden lg:table-cell py-1.5 pr-4 max-w-[180px] truncate text-red-400/70">{item.errorMessage ?? '-'}</td>
                                <td className="py-1.5">
                                  {item.status === 'FAILED' && (
                                    <button
                                      onClick={() => { if (!isLineConfigured()) { toastError('LINE ไม่ได้รับการตั้งค่า ไม่สามารถส่งซ้ำได้'); return; } void handleResendItem(order.id, item.id); }}
                                      aria-label="ส่งซ้ำ"
                                      className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-2 py-1 text-xs font-medium text-[hsl(var(--card-foreground))] transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--color-surface))]/[0.05]"
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
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[hsl(var(--glass-border))] px-4 py-3">
            <span className="text-sm text-[hsl(var(--on-surface-variant))]">หน้า {page} จาก {totalPages} ({total} รายการ)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--color-surface))]/[0.05] disabled:opacity-50">
                ก่อนหน้า
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="inline-flex items-center gap-2 rounded-lg border border-[hsl(var(--glass-border))] glass-card px-4 py-2 text-sm font-medium text-[hsl(var(--card-foreground))] shadow-sm transition-all hover:scale-105 active:scale-95 hover:bg-[hsl(var(--color-surface))]/[0.05] disabled:opacity-50">
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </section>
    </motion.div>
  );
}
