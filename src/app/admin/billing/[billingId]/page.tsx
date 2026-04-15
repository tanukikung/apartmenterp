'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  FileText,
  Hash,
  Inbox,
  Lock,
  MessageSquare,
  Package,
  Receipt,
  RefreshCw,
  Send,
  Users,
  XCircle,
} from 'lucide-react';

// Workaround: cast Lock to React.FC for TypeScript compatibility with lucide-react
const LockIcon: React.FC<{ className?: string }> = Lock as React.FC<{ className?: string }>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CycleStatus = 'OPEN' | 'IMPORTED' | 'LOCKED' | 'INVOICED' | 'CLOSED';

type BillingCycle = {
  id: string;
  year: number;
  month: number;
  status: CycleStatus;
  importBatchId?: string | null;
  totalRecords?: number;
  totalAmount?: number;
  invoicesIssued?: number;
  paymentsReceived?: number;
  totalRooms?: number;
  missingRooms?: number;
};

type BillingItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

type BillingRecord = {
  id: string;
  roomNumber?: string;
  room?: { roomNumber: string } | null;
  tenantName?: string;
  tenant?: { name: string } | null;
  totalAmount: number;
  status: string;
  items?: BillingItem[];
  _expanded?: boolean;
};

type InvoiceStatus = 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE' | 'CANCELLED';

type Invoice = {
  id: string;
  roomNumber?: string;
  room?: { roomNumber: string } | null;
  tenantName?: string;
  tenant?: { name: string } | null;
  totalAmount: number;
  status: InvoiceStatus;
  sentAt?: string | null;
  dueDate?: string | null;
};

type ImportBatch = {
  id: string;
  sourceFilename?: string;
  importedAt?: string;
  createdAt?: string;
  totalRows?: number;
  validRows?: number;
  invalidRows?: number;
  warningRows?: number;
  rows?: ImportRow[];
};

type ImportRow = {
  id: string;
  rowNo?: number;
  roomNumber?: string;
  validationStatus?: string;
  validationErrors?: Array<{ message?: string }>;
};

type ActiveTab = 'records' | 'invoices' | 'batch';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function thaiMonthYear(year: number, month: number): string {
  return `${THAI_MONTHS[(month - 1) % 12]} ${year + 543}`;
}

function money(amount: number | null | undefined): string {
  if (amount == null) return '฿0';
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function cycleBadgeClass(status: CycleStatus): string {
  switch (status) {
    case 'CLOSED': return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'IMPORTED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'LOCKED': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'INVOICED': return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'OPEN': return 'bg-amber-100 text-amber-700 border-amber-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function invoiceBadgeClass(status: InvoiceStatus): string {
  switch (status) {
    case 'PAID': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'SENT': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'OVERDUE': return 'bg-red-100 text-red-700 border-red-200';
    case 'DRAFT': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'CANCELLED': return 'bg-slate-100 text-slate-500 border-slate-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

function recordStatusBadgeClass(status: string): string {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED': return 'bg-emerald-100 text-emerald-700';
    case 'DRAFT': return 'bg-amber-100 text-amber-700';
    case 'VOID': return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function getRoomNumber(r: { roomNumber?: string; roomNo?: string; room?: { roomNumber: string } | null }): string {
  return r.roomNumber ?? r.roomNo ?? r.room?.roomNumber ?? '-';
}

function getTenantName(r: { tenantName?: string; tenant?: { name: string } | null }): string {
  return r.tenantName ?? r.tenant?.name ?? 'ไม่ระบุผู้เช่า';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? 'border-indigo-600 text-indigo-700'
          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</div>
          <div className="text-xl font-semibold text-on-surface mt-0.5">{value}</div>
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm ${iconBg} ${iconColor}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Records Tab
// ---------------------------------------------------------------------------

function RecordsTab({ cycleId }: { cycleId: string }) {
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/billing?billingPeriodId=${cycleId}&pageSize=100`, {
          cache: 'no-store',
        }).then((r) => r.json());
        if (res.success && res.data) {
          const raw = res.data?.data ?? res.data ?? [];
          const list: BillingRecord[] = Array.isArray(raw) ? raw : [];
          setRecords(list);
          setLoading(false);
          return;
        }
      } catch {
        // fall through to error state
      }
      setError('ไม่สามารถโหลดรายการบิล');
      setLoading(false);
    })();
  }, [cycleId]);

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">กำลังโหลดรายการบิล...</div>
    );
  }

  if (error) {
    return <div className="auth-alert auth-alert-error">{error}</div>;
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Inbox className="h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-500">ยังไม่มีรายการบิลในรอบนี้</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-surface-container">
          <tr>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant" />
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ผู้เช่า</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">รายการ</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ยอดรวม</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec) => {
            const isOpen = expanded.has(rec.id);
            const items = rec.items ?? [];
            const itemSummary =
              items.length > 0
                ? items.map((it) => it.description).join(', ')
                : `${items.length} items`;
            return (
              <React.Fragment key={rec.id}>
                <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggleRow(rec.id)}>
                  <td className="w-8 text-center">
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate-400 inline" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400 inline" />
                    )}
                  </td>
                  <td>
                    <span className="font-semibold text-slate-800">{getRoomNumber(rec)}</span>
                  </td>
                  <td className="text-slate-600">{getTenantName(rec)}</td>
                  <td className="max-w-[240px] truncate text-slate-500 text-sm">
                    {items.length === 0 ? (
                      <span className="text-slate-400 italic">ไม่มีรายการ</span>
                    ) : (
                      itemSummary
                    )}
                  </td>
                  <td className="font-semibold text-slate-800 tabular-nums">
                    {money(rec.totalAmount)}
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${recordStatusBadgeClass(rec.status)}`}
                    >
                      {rec.status ?? 'DRAFT'}
                    </span>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${rec.id}-expand`} className="bg-slate-50/70">
                    <td colSpan={6} className="px-4 pb-4 pt-2">
                      {items.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">ไม่มีรายการบิล</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              <th className="pb-1 text-left">รายการ</th>
                              <th className="pb-1 text-right">จำนวน</th>
                              <th className="pb-1 text-right">ราคา/หน่วย</th>
                              <th className="pb-1 text-right">ยอดรวม</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((it) => (
                              <tr key={it.id} className="border-b border-slate-100 last:border-0">
                                <td className="py-1.5 text-slate-700">{it.description}</td>
                                <td className="py-1.5 text-right tabular-nums text-slate-600">
                                  {it.quantity}
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-slate-600">
                                  {money(it.unitPrice)}
                                </td>
                                <td className="py-1.5 text-right tabular-nums font-semibold text-slate-800">
                                  {money(it.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Lock button for DRAFT records */}
                      {rec.status === 'DRAFT' && (
                        <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              // Optimistic update
                              setRecords((prev) => prev.map(r => r.id === rec.id ? { ...r, status: 'LOCKED' } : r));
                              // Revert on failure
                              const res = await fetch(`/api/billing/${rec.id}/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                              if (!res.ok) {
                                setRecords((prev) => prev.map(r => r.id === rec.id ? { ...r, status: 'DRAFT' } : r));
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                          >
                            <LockIcon className="h-3.5 w-3.5" />
                            ล็อกบันทึก
                          </button>
                          <span className="text-xs text-slate-500">ล็อกเพื่อเปิดใช้งานการสร้างใบแจ้งหนี้</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoices Tab
// ---------------------------------------------------------------------------

function InvoicesTab({ cycleId }: { cycleId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices?billingCycleId=${cycleId}&pageSize=100`, {
        cache: 'no-store',
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถโหลดใบแจ้งหนี้');
      setInvoices(res.data?.data ?? res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดใบแจ้งหนี้');
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendInvoice(invoiceId: string) {
    setSending(invoiceId);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json());
      if (!res.success) throw new Error(res.error?.message || 'ไม่สามารถส่งใบแจ้งหนี้');
      setMessage('ส่งใบแจ้งหนี้ทาง LINE แล้ว');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถส่งใบแจ้งหนี้');
    } finally {
      setSending(null);
    }
  }

  async function sendAllUnsent() {
    const unsent = invoices.filter((inv) => inv.status === 'DRAFT' || inv.status === 'GENERATED');
    if (unsent.length === 0) return;
    setSendingAll(true);
    setMessage(null);
    setError(null);
    let sent = 0;
    for (const inv of unsent) {
      try {
        const res = await fetch(`/api/invoices/${inv.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).then((r) => r.json());
        if (res.success) sent++;
      } catch {
        // continue with next
      }
    }
    setMessage(`Sent ${sent} of ${unsent.length} unsent invoices.`);
    setSendingAll(false);
    await load();
  }

  const unsentCount = invoices.filter((inv) => inv.status === 'DRAFT' || inv.status === 'GENERATED').length;

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">กำลังโหลดใบแจ้งหนี้...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <div className="auth-alert auth-alert-success">{message}</div>}
      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Bulk action bar */}
      {unsentCount > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm text-amber-800">
            <span className="font-semibold">{unsentCount}</span> unsent invoice
            {unsentCount !== 1 ? 's' : ''} ready to send via LINE.
          </span>
          <button
            onClick={() => void sendAllUnsent()}
            disabled={sendingAll}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors"
          >
            <Send className="h-4 w-4" />
            {sendingAll ? 'Sending...' : 'Send All Unsent'}
          </button>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileText className="h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">ยังไม่มีใบแจ้งหนี้ในรอบบิลนี้</p>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-container">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">รหัสใบแจ้งหนี้</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ผู้เช่า</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">จำนวน</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">วันครบกำหนด</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">สถานะ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ส่งเมื่อ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <Link
                      href={`/admin/invoices/${inv.id}`}
                      className="font-mono text-xs text-primary hover:underline" title={inv.id}
                    >
                      {inv.id.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="font-semibold text-slate-800">{getRoomNumber(inv)}</td>
                  <td className="text-slate-600">{getTenantName(inv)}</td>
                  <td className="tabular-nums font-semibold text-slate-800">
                    {money(inv.totalAmount)}
                  </td>
                  <td className="text-slate-600">{fmtDate(inv.dueDate)}</td>
                  <td>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${invoiceBadgeClass(inv.status)}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="text-slate-500 text-sm">{fmtDateTime(inv.sentAt)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      {(inv.status === 'DRAFT' || inv.status === 'GENERATED' || inv.status === 'VIEWED') && (
                        <button
                          onClick={() => void sendInvoice(inv.id)}
                          disabled={sending === inv.id}
                          className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {sending === inv.id ? '...' : 'LINE'}
                        </button>
                      )}
                      <Link
                        href={`/api/invoices/${inv.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        PDF
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Batch Tab
// ---------------------------------------------------------------------------

function BatchTab({ batchId }: { batchId: string }) {
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/billing/import/batches/${batchId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setBatch(res.data as ImportBatch);
        } else {
          throw new Error(res.error?.message || 'ไม่สามารถโหลดแบทช์นำเข้า');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'ไม่สามารถโหลดแบทช์นำเข้า');
      })
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">กำลังโหลดข้อมูลนำเข้า...</div>;
  }

  if (error) {
    return <div className="auth-alert auth-alert-error">{error}</div>;
  }

  if (!batch) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Package className="h-10 w-10 text-slate-300" />
        <p className="text-sm text-slate-500">ไม่พบข้อมูลนำเข้า</p>
      </div>
    );
  }

  const rows = batch.rows ?? [];
  const filename = batch.sourceFilename ?? 'Unknown file';
  const importedAt = batch.importedAt ?? batch.createdAt;
  const totalRows = batch.totalRows ?? rows.length;
  const validRows = batch.validRows ?? rows.filter((r) => r.validationStatus === 'VALID').length;
  const invalidRows = batch.invalidRows ?? rows.filter((r) => r.validationStatus === 'ERROR').length;

  return (
    <div className="flex flex-col gap-4">
      {/* Batch info card */}
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">ไฟล์</div>
          <div className="mt-1 text-sm font-medium text-slate-800 break-all">{filename}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">นำเข้าเมื่อ</div>
          <div className="mt-1 text-sm font-medium text-slate-800">{fmtDateTime(importedAt)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">จำนวนรายการ</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 tabular-nums">{totalRows}</div>
        </div>
        <div className="flex gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">ถูกต้อง</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">{validRows}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-red-500">ไม่ถูกต้อง</div>
            <div className="mt-1 text-2xl font-bold text-red-600 tabular-nums">{invalidRows}</div>
          </div>
        </div>
      </div>

      {/* Rows table */}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">ไม่มีรายละเอียดรายการ</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-surface-container">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">#</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ห้อง</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">การตรวจสอบ</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">ข้อผิดพลาด</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const firstError = row.validationErrors?.[0]?.message ?? null;
                const isValid = row.validationStatus !== 'ERROR';
                return (
                  <tr key={row.id}>
                    <td className="tabular-nums text-slate-500">{row.rowNo ?? idx + 1}</td>
                    <td className="font-semibold text-slate-800">{row.roomNumber ?? '-'}</td>
                    <td>
                      {isValid ? (
                        <span className="flex items-center gap-1 text-emerald-600 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          ถูกต้อง
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600 text-sm font-medium">
                          <XCircle className="h-4 w-4" />
                          ไม่ถูกต้อง
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-red-600">
                      {firstError ? firstError : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BillingCycleDetailPage() {
  const params = useParams<{ billingId: string }>();
  const searchParams = useSearchParams();
  const billingId = params.billingId;

  // Support deep-linking to a specific tab via ?tab=invoices|records|batch
  const initialTab = ((): ActiveTab => {
    const t = searchParams?.get('tab');
    if (t === 'invoices' || t === 'records' || t === 'batch') return t;
    return 'records';
  })();

  const [cycle, setCycle] = useState<BillingCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!billingId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    // Try the canonical cycle endpoint first, then fall back to a billing record lookup.
    const endpoints = [
      `/api/billing-cycles/${billingId}`,
      `/api/billing/${billingId}`,
    ];

    for (const url of endpoints) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.status === 404) continue;
        const res = await r.json();
        if (res.success && res.data) {
          setCycle(res.data as BillingCycle);
          setLoading(false);
          return;
        }
      } catch {
        // try next
      }
    }

    setNotFound(true);
    setLoading(false);
  }, [billingId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Loading state
  if (loading) {
    return (
      <main className="space-y-6">
        <div className="py-16 text-center text-sm text-on-surface-variant">กำลังโหลดรอบบิล...</div>
      </main>
    );
  }

  // Not found fallback
  if (notFound || (!loading && !cycle)) {
    return (
      <main className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm text-on-surface-variant">
          <Link href="/admin/billing" className="hover:text-primary transition-colors">
            Billing
          </Link>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium text-on-surface">ไม่พบ</span>
        </nav>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-outline-variant/10 bg-surface-container-lowest py-20 text-center">
          <AlertTriangle className="h-12 w-12 text-tertiary" />
          <div>
            <h2 className="text-lg font-semibold text-on-surface">ไม่พบรอบบิล</h2>
            <p className="mt-1 text-sm text-slate-500">
              ไม่พบรอบบิลหรือใบแจ้งหนี้ที่มี ID <code className="font-mono text-xs">{billingId}</code>
            </p>
          </div>
          <Link href="/admin/billing" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-primary text-on-primary hover:bg-primary/90 px-4 py-2 text-sm font-medium shadow-sm transition-colors mt-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Billing
          </Link>
        </div>
      </main>
    );
  }

  const cycleLabel = cycle
    ? thaiMonthYear(cycle.year, cycle.month)
    : 'Billing Cycle';

  const building = 'รอบบิล';
  const batchId = cycle?.importBatchId;

  return (
    <main className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-on-surface-variant">
        <Link href="/admin/billing" className="hover:text-primary transition-colors">
          Billing
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium text-on-surface">{cycleLabel}</span>
      </nav>

      {/* Page header */}
      <section className="rounded-2xl border border-outline-variant/10 bg-gradient-to-br from-primary-container to-primary px-6 py-5">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/billing"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-sm transition-colors hover:border-primary/30 hover:bg-surface-container"
          >
            <ArrowLeft className="h-4 w-4 text-on-primary" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-on-primary">{cycleLabel}</h1>
              {cycle?.status && (
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${cycleBadgeClass(cycle.status as CycleStatus)}`}
                >
                  {cycle.status}
                </span>
              )}
            </div>
            <p className="text-sm text-on-primary/80">
              {building}
              {batchId && (
                <span className="ml-2 font-mono text-xs text-on-primary/60">
                  Batch: {batchId.slice(0, 8)}…
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          {/* Lock All — fetches records inline to lock all DRAFT records */}
          <button
            onClick={async () => {
              setBulkMessage(null);
              const allRecords: BillingRecord[] = [];
              let page = 1;
              while (true) {
                const res = await fetch(`/api/billing?billingPeriodId=${billingId}&page=${page}&pageSize=100`, { cache: 'no-store' }).then(r => r.json());
                if (!res.success) break;
                const records: BillingRecord[] = res.data?.data ?? res.data ?? [];
                if (records.length === 0) break;
                allRecords.push(...records);
                if (records.length < 100) break;
                page++;
              }
              const draftRecords = allRecords.filter(r => r.status === 'DRAFT');
              if (draftRecords.length === 0) {
                setBulkMessage({ type: 'success', text: 'ไม่มีรายการ DRAFT ที่ต้องล็อก' });
                return;
              }
              let locked = 0;
              let failed = 0;
              for (const rec of draftRecords) {
                const res = await fetch(`/api/billing/${rec.id}/lock`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({}),
                });
                if (res.ok) locked++;
                else failed++;
              }
              setBulkMessage({
                type: failed > 0 ? 'error' : 'success',
                text: `Locked ${locked} of ${draftRecords.length} record${draftRecords.length !== 1 ? 's' : ''}${failed > 0 ? `. ${failed} failed.` : '.'}`,
              });
              await load();
              setActiveTab('records');
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
          >
            <Lock className="h-4 w-4" />
            ล็อกทั้งหมด
          </button>

          {/* Generate Invoices — fetches records inline to generate for all LOCKED records */}
          <button
            onClick={async () => {
              setBulkMessage(null);
              const allRecords: BillingRecord[] = [];
              let page = 1;
              while (true) {
                const res = await fetch(`/api/billing?billingPeriodId=${billingId}&page=${page}&pageSize=100`, { cache: 'no-store' }).then(r => r.json());
                if (!res.success) break;
                const records: BillingRecord[] = res.data?.data ?? res.data ?? [];
                if (records.length === 0) break;
                allRecords.push(...records);
                if (records.length < 100) break;
                page++;
              }
              const lockedRecords = allRecords.filter(r => r.status === 'LOCKED');
              if (lockedRecords.length === 0) {
                setBulkMessage({ type: 'success', text: 'ไม่มีรายการ LOCKED ที่ต้องสร้างใบแจ้งหนี้' });
                return;
              }
              let generated = 0;
              let failed = 0;
              for (const rec of lockedRecords) {
                const res = await fetch('/api/invoices/generate', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ billingRecordId: rec.id }),
                });
                if (res.ok) generated++;
                else failed++;
              }
              setBulkMessage({
                type: failed > 0 ? 'error' : 'success',
                text: `Generated ${generated} invoice${generated !== 1 ? 's' : ''}${failed > 0 ? `. ${failed} failed.` : '.'}`,
              });
              await load();
              setActiveTab('invoices');
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
          >
            <FileText className="h-4 w-4" />
            สร้างใบแจ้งหนี้
          </button>
        </div>
        {bulkMessage && (
          <div className={`mt-3 rounded-lg px-4 py-2 text-sm ${bulkMessage.type === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
            {bulkMessage.text}
          </div>
        )}
      </section>

      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* Stats row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="รายการทั้งหมด"
          value={cycle?.totalRecords ?? '—'}
          icon={<Hash className="h-5 w-5" />}
          iconBg="border-indigo-200 bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <StatCard
          label="ยอดรวม"
          value={money(cycle?.totalAmount)}
          icon={<Receipt className="h-5 w-5" />}
          iconBg="border-emerald-200 bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatCard
          label="ใบแจ้งหนี้ที่ออก"
          value={cycle?.invoicesIssued ?? '—'}
          icon={<FileText className="h-5 w-5" />}
          iconBg="border-blue-200 bg-blue-50"
          iconColor="text-blue-600"
        />
        <StatCard
          label="ชำระแล้ว"
          value={cycle?.paymentsReceived ?? '—'}
          icon={<Users className="h-5 w-5" />}
          iconBg="border-violet-200 bg-violet-50"
          iconColor="text-violet-600"
        />
      </section>

      {/* Tabs + content */}
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-outline-variant px-4">
          <TabButton active={activeTab === 'records'} onClick={() => setActiveTab('records')}>
            <Hash className="h-4 w-4" />
            รายการ
          </TabButton>
          <TabButton active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')}>
            <FileText className="h-4 w-4" />
            ใบแจ้งหนี้
          </TabButton>
          <TabButton
            active={activeTab === 'batch'}
            onClick={() => setActiveTab('batch')}
          >
            <Package className="h-4 w-4" />
            นำเข้า
          </TabButton>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {activeTab === 'records' && <RecordsTab cycleId={billingId} />}
          {activeTab === 'invoices' && <InvoicesTab cycleId={billingId} />}
          {activeTab === 'batch' && (
            batchId ? (
              <BatchTab batchId={batchId} />
            ) : (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Package className="h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-500">ยังไม่มีข้อมูลนำเข้าในรอบบิลนี้</p>
              </div>
            )
          )}
        </div>
      </section>
    </main>
  );
}
