'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import React from 'react';
import {
  AlertTriangle,
  BarChart2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CycleStatus = 'OPEN' | 'IMPORTED' | 'LOCKED' | 'INVOICED' | 'CLOSED';

interface BillingCycle {
  id: string;
  year: number;
  month: number;
  status: CycleStatus;
  building: { id: string; name: string } | null;
  totalRecords: number;
  totalAmount: number;
  invoiceCount: number;
  pendingInvoices: number;
  billingDate: string | null;
  dueDate: string | null;
  createdAt: string;
}

type InvoiceStatus = 'GENERATED' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE';
interface Invoice {
  id: string;
  invoiceNumber: string;
  roomNo: string;
  tenantName: string;
  periodLabel: string;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  paidAt: string | null;
}

interface KpiData {
  openCycles: number;
  totalBilledThisMonth: number;
  totalRecords: number;
  pendingInvoices: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const STATUS_BADGE: Record<CycleStatus, { cls: string; label: string }> = {
  OPEN:     { cls: 'bg-blue-100 text-blue-700 border-blue-200',           label: 'Open'     },
  IMPORTED: { cls: 'bg-primary-container text-primary-container',        label: 'Imported' },
  LOCKED:   { cls: 'bg-amber-100 text-amber-700 border-amber-200',       label: 'Locked'   },
  INVOICED: { cls: 'bg-tertiary-container text-on-tertiary-container',   label: 'Invoiced' },
  CLOSED:   { cls: 'bg-surface-container text-on-surface-variant',       label: 'Closed'   },
};

const INVOICE_STATUS_BADGE: Record<InvoiceStatus, { cls: string; label: string }> = {
  GENERATED: { cls: 'bg-surface-container text-on-surface-variant',    label: 'รอส่ง' },
  SENT:      { cls: 'bg-primary-container text-primary-container',     label: 'ส่งแล้ว' },
  VIEWED:    { cls: 'bg-tertiary-container text-on-tertiary-container', label: 'เปิดแล้ว' },
  PAID:      { cls: 'bg-tertiary-container text-on-tertiary-container', label: 'ชำระแล้ว' },
  OVERDUE:   { cls: 'bg-error-container text-on-error-container',       label: 'เกินกำหนด' },
};

const STATUS_FILTER_OPTIONS: { value: CycleStatus | 'ALL'; label: string }[] = [
  { value: 'ALL',      label: 'ทุกสถานะ' },
  { value: 'OPEN',     label: 'Open'     },
  { value: 'IMPORTED', label: 'Imported' },
  { value: 'LOCKED',   label: 'Locked'   },
  { value: 'INVOICED', label: 'Invoiced' },
  { value: 'CLOSED',   label: 'Closed'   },
];

const INVOICE_TABS: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'ทั้งหมด' },
  { value: 'GENERATED', label: 'รอส่ง' },
  { value: 'SENT', label: 'ส่งแล้ว' },
  { value: 'VIEWED', label: 'เปิดแล้ว' },
  { value: 'PAID', label: 'ชำระแล้ว' },
  { value: 'OVERDUE', label: 'เกินกำหนด' },
];

function getMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [{ value: 'ALL', label: 'ทุกเดือน' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    options.push({
      value: `${y}-${String(m).padStart(2, '0')}`,
      label: `${THAI_MONTHS[m - 1]} ${y + 543}`,
    });
  }
  return options;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function thaiMonthYear(year: number, month: number): string {
  const m = THAI_MONTHS[month - 1] ?? String(month);
  return `${m} ${year + 543}`;
}

function formatBaht(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function deriveKpis(cycles: BillingCycle[]): KpiData {
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();
  const openCycles = cycles.filter((c) => c.status === 'OPEN' || c.status === 'IMPORTED').length;
  const totalBilledThisMonth = cycles
    .filter((c) => c.year === thisYear && c.month === thisMonth)
    .reduce((s, c) => s + (c.totalAmount ?? 0), 0);
  const totalRecords = cycles.reduce((s, c) => s + (c.totalRecords ?? 0), 0);
  const pendingInvoices = cycles.reduce((s, c) => s + (c.pendingInvoices ?? 0), 0);
  return { openCycles, totalBilledThisMonth, totalRecords, pendingInvoices };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: CycleStatus }) {
  const { cls, label } = STATUS_BADGE[status] ?? {
    cls: 'bg-surface-container text-on-surface-variant',
    label: status,
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { cls, label } = INVOICE_STATUS_BADGE[status] ?? {
    cls: 'bg-surface-container text-on-surface-variant',
    label: status,
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI card — M3 surface-container-lowest
// ---------------------------------------------------------------------------

function KpiCard({
  label, value, sub, icon, iconBg, iconColor,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; iconBg: string; iconColor: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 hover:shadow-lg transition-all">
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-on-surface-variant">{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-on-surface">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-on-surface-variant">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row action state
// ---------------------------------------------------------------------------

type BatchState = 'idle' | 'locking' | 'generating' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminBillingPage() {
  const [activeTab, setActiveTab] = useState<'cycles' | 'invoices'>('cycles');
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);

  const [statusFilter, setStatusFilter] = useState<CycleStatus | 'ALL'>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');

  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [invoiceSearch, setInvoiceSearch] = useState('');

  const [batchState, setBatchState] = useState<Record<string, BatchState>>({});
  const [batchMsg,   setBatchMsg]   = useState<Record<string, string>>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const monthOptions = getMonthOptions();
  const kpis = deriveKpis(cycles);

  // ---------------------------------------------------------------------------
  // Load cycles
  // ---------------------------------------------------------------------------

  const loadCycles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing-cycles?pageSize=50&sortBy=year&sortOrder=desc', {
        cache: 'no-store',
      });
      if (!res.ok) { setApiAvailable(false); setCycles([]); setLoading(false); return; }
      const json = await res.json();
      const list: BillingCycle[] = json.data?.data ?? [];
      setCycles(list);
      setApiAvailable(true);
    } catch {
      setCycles([]); setApiAvailable(false);
    } finally { setLoading(false); }
  }, []);

  const loadInvoices = useCallback(async () => {
    setInvoiceLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '50', sortBy: 'createdAt', sortOrder: 'desc' });
      const res = await fetch(`/api/invoices?${params}`, { cache: 'no-store' });
      if (!res.ok) {
        setInvoiceLoading(false);
        setSendError(`ไม่สามารถโหลดใบแจ้งหนี้: HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setInvoices(json.data?.data ?? []);
    } catch (err) {
      setSendError(`ไม่สามารถโหลดใบแจ้งหนี้: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally { setInvoiceLoading(false); }
  }, []);

  useEffect(() => { void loadCycles(); }, [loadCycles]);

  const handleTabChange = (tab: 'cycles' | 'invoices') => {
    setActiveTab(tab);
    if (tab === 'invoices' && invoices.length === 0) { void loadInvoices(); }
  };

  /**
   * Batch: Lock all DRAFT records → then generate all invoices for a period.
   * needsLock = true  → OPEN / IMPORTED  (must lock first)
   * needsLock = false → LOCKED           (already locked, just generate)
   */
  async function handleBatchGenerate(periodId: string, needsLock: boolean) {
    const set = (s: BatchState) => setBatchState(p => ({ ...p, [periodId]: s }));
    const msg = (m: string)      => setBatchMsg(p  => ({ ...p, [periodId]: m  }));

    set('locking');
    msg('');
    setSendError(null);

    try {
      // ── Step 1: Lock all DRAFT records (skip if already LOCKED) ──────────
      if (needsLock) {
        const lockRes = await fetch(`/api/billing/periods/${periodId}/lock-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const lockJson = await lockRes.json();
        if (!lockRes.ok) {
          throw new Error(lockJson.error?.message ?? `Lock failed: HTTP ${lockRes.status}`);
        }
        msg(`Locked ${lockJson.data?.locked ?? 0} records…`);
      }

      // ── Step 2: Generate invoices for all LOCKED records ─────────────────
      set('generating');
      const genRes = await fetch(`/api/billing/periods/${periodId}/generate-invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const genJson = await genRes.json();
      if (!genRes.ok) {
        throw new Error(genJson.error?.message ?? `Generate failed: HTTP ${genRes.status}`);
      }

      const { generated, skipped, errors } = genJson.data ?? {};
      const summary = [
        `สร้าง ${generated ?? 0} ใบ`,
        skipped  ? `ข้าม ${skipped} ใบ` : '',
        errors   ? `ผิดพลาด ${errors} ใบ` : '',
      ].filter(Boolean).join(' • ');

      set('done');
      msg(summary);
      setSendSuccess(`${summary} — สำเร็จ`);
      void loadCycles();
      void loadInvoices();
    } catch (err) {
      set('error');
      const m = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      msg(m);
      setSendError(m);
    }
  }

  async function handleSendInvoice(invoiceId: string) {
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST', cache: 'no-store' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message || `HTTP ${res.status}: ส่งไม่สำเร็จ`);
      }
      setSendSuccess(`ส่งใบแจ้งหนี้สำเร็จแล้ว`);
      void loadInvoices();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'ส่งไม่สำเร็จ');
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered lists
  // ---------------------------------------------------------------------------

  const filteredCycles = cycles.filter((c) => {
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchMonth = monthFilter === 'ALL' || monthFilter === `${c.year}-${String(c.month).padStart(2, '0')}`;
    return matchStatus && matchMonth;
  });

  const filteredInvoices = invoices.filter((inv) => {
    const matchStatus = invoiceStatusFilter === 'ALL' || inv.status === invoiceStatusFilter;
    const matchSearch =
      !invoiceSearch.trim() ||
      inv.invoiceNumber.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.roomNo.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.tenantName.toLowerCase().includes(invoiceSearch.toLowerCase());
    return matchStatus && matchSearch;
  });

  const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">บิล</h1>
          <p className="mt-1 text-sm text-on-surface-variant">จัดการรอบบิล สร้างใบแจ้งหนี้ และติดตามการชำระเงิน</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/billing/import" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container hover:shadow-sm">
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Link>
          <button
            onClick={() => { setActiveTab('invoices'); void loadInvoices(); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90"
          >
            <ReceiptText className="h-4 w-4" />
            ใบแจ้งหนี้
            {overdueCount > 0 && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold text-white">{overdueCount}</span>
            )}
          </button>
          <button
            onClick={() => void (activeTab === 'cycles' ? loadCycles() : loadInvoices())}
            disabled={loading || invoiceLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container"
          >
            <RefreshCw className={`h-4 w-4 ${loading || invoiceLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="inline-flex items-center gap-1 rounded-xl bg-surface-container p-1 w-fit">
        {[
          { id: 'cycles', label: 'รอบบิล', icon: <ReceiptText className="h-4 w-4" />, count: cycles.length },
          { id: 'invoices', label: 'ใบแจ้งหนี้', icon: <FileText className="h-4 w-4" />, badge: overdueCount > 0 ? `${overdueCount} ค้าง` : null },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id as 'cycles' | 'invoices')}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-surface-container-lowest text-primary shadow-sm'
                : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
            }`}
          >
            {tab.icon}
            {tab.label}
            {'count' in tab && (
              <span className="rounded-full bg-surface-container px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                {tab.count}
              </span>
            )}
            {'badge' in tab && tab.badge && (
              <span className="rounded-full bg-error-container px-2 py-0.5 text-[11px] font-semibold text-on-error-container">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Alerts ─────────────────────────────────────────── */}
      {sendError && (
        <div className="px-4 py-3 rounded-lg bg-error-container/10 border border-error-container/20 text-sm text-error font-medium">
          {sendError}
        </div>
      )}
      {sendSuccess && (
        <div className="px-4 py-3 rounded-lg bg-tertiary-container/10 border border-tertiary-container/20 text-sm text-tertiary-container font-medium">
          {sendSuccess}
        </div>
      )}

      {/* ── CYCLE TAB ─────────────────────────────────────────── */}
      {activeTab === 'cycles' && (
        <>
          {/* API unavailable notice */}
          {!loading && !apiAvailable && (
            <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm text-on-surface">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <span className="font-semibold">Billing API not available.</span>{' '}
                Start by importing your first billing cycle via Excel.
              </div>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 animate-pulse">
                  <div className="flex items-start gap-4">
                    <div className="h-11 w-11 rounded-xl bg-surface-container" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 w-20 rounded bg-surface-container" />
                      <div className="h-6 w-16 rounded bg-surface-container" />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <>
                <KpiCard label="Active Cycles" value={kpis.openCycles} sub="Open + Imported" icon={<Zap className="h-5 w-5" />} iconBg="bg-primary-container" iconColor="text-primary" />
                <KpiCard label="Total Billed This Month" value={`฿${formatBaht(kpis.totalBilledThisMonth)}`} icon={<BarChart2 className="h-5 w-5" />} iconBg="bg-tertiary-container" iconColor="text-on-tertiary-container" />
                <KpiCard label="Total Records" value={kpis.totalRecords.toLocaleString()} sub="Billing records across all cycles" icon={<FileText className="h-5 w-5" />} iconBg="bg-surface-container" iconColor="text-on-surface-variant" />
                <KpiCard label="Pending Invoices" value={kpis.pendingInvoices} sub="Not yet paid" icon={<ReceiptText className="h-5 w-5" />} iconBg="bg-amber-100" iconColor="text-amber-700" />
              </>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CycleStatus | 'ALL')}
                className="appearance-none rounded-lg border border-outline bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
            </div>

            <div className="relative">
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="appearance-none rounded-lg border border-outline bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {monthOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
            </div>

            {(statusFilter !== 'ALL' || monthFilter !== 'ALL') && (
              <button
                onClick={() => { setStatusFilter('ALL'); setMonthFilter('ALL'); }}
                className="rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredCycles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <FileSpreadsheet className="mb-3 h-12 w-12 text-outline-variant" />
                {cycles.length === 0 ? (
                  <>
                    <p className="font-semibold text-on-surface">ยังไม่มีรอบบิล</p>
                    <p className="mt-1 text-sm text-on-surface-variant">เริ่มต้นโดย Import Excel</p>
                    <Link href="/admin/billing/import" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90">
                      <FileSpreadsheet className="h-4 w-4" />
                      Import Excel
                    </Link>
                  </>
                ) : (
                  <p className="font-semibold text-on-surface">ไม่พบรอบบิลที่ตรงกับตัวกรอง</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      {['เดือน/ปี', 'สถานะ', 'รายการ', 'ยอดรวม', 'ใบแจ้งหนี้', 'วันครบกำหนด', 'จัดการ'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCycles.map((cycle) => {
                      const bs   = batchState[cycle.id] ?? 'idle';
                      const bmsg = batchMsg[cycle.id] ?? '';
                      const busy = bs === 'locking' || bs === 'generating';

                      // What action is available?
                      const needsLock   = cycle.status === 'OPEN' || cycle.status === 'IMPORTED';
                      const needsGen    = cycle.status === 'LOCKED';
                      const canBatch    = needsLock || needsGen;

                      return (
                        <React.Fragment key={cycle.id}>
                          <tr className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-on-surface whitespace-nowrap">
                              {thaiMonthYear(cycle.year, cycle.month)}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={bs === 'done' ? 'INVOICED' : cycle.status} />
                            </td>
                            <td className="px-4 py-3 text-right text-on-surface-variant">
                              {(cycle.totalRecords ?? 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-on-surface whitespace-nowrap">
                              ฿{formatBaht(cycle.totalAmount ?? 0)}
                            </td>
                            <td className="px-4 py-3 text-right text-on-surface-variant">
                              {cycle.invoiceCount > 0 ? (
                                <span>
                                  {cycle.invoiceCount}
                                  {cycle.pendingInvoices > 0 && (
                                    <span className="ml-1.5 text-xs text-error">({cycle.pendingInvoices} รอ)</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-outline">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap text-xs">
                              {cycle.dueDate
                                ? new Date(cycle.dueDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
                                : <span className="text-outline">—</span>
                              }
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/admin/billing/${cycle.id}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-outline px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                                >
                                  ดูรายละเอียด
                                </Link>

                                {canBatch && bs !== 'done' && (
                                  <button
                                    onClick={() => void handleBatchGenerate(cycle.id, needsLock)}
                                    disabled={busy}
                                    title={needsLock ? 'Lock ทั้งหมด แล้ว Generate Invoices' : 'Generate Invoices ทั้งหมด'}
                                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
                                  >
                                    {bs === 'locking' ? (
                                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลัง Lock…</>
                                    ) : bs === 'generating' ? (
                                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังสร้างบิล…</>
                                    ) : needsLock ? (
                                      <><Zap className="h-3.5 w-3.5" /> Lock + Generate All</>
                                    ) : (
                                      <><Send className="h-3.5 w-3.5" /> Generate All</>
                                    )}
                                  </button>
                                )}

                                {bs === 'done' && bmsg && (
                                  <span className="text-xs font-medium text-tertiary-container">✓ {bmsg}</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          {bs === 'error' && bmsg && (
                            <tr className="bg-error-container/10">
                              <td colSpan={7} className="px-4 py-2">
                                <div className="flex items-center gap-2 text-xs text-on-error-container">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  {bmsg}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loading && filteredCycles.length > 0 && (
            <p className="text-right text-xs text-on-surface-variant">
              แสดง {filteredCycles.length} จาก {cycles.length} รอบบิล
            </p>
          )}
        </>
      )}

      {/* ── INVOICE TAB ──────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <>
          {/* Invoice search + filter */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
              <input
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="ค้นหาเลขใบแจ้งหนี้, ห้อง, ชื่อผู้เช่า..."
                className="w-full rounded-lg border border-outline bg-surface-container-lowest py-2 pl-9 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="relative">
              <select
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value as InvoiceStatus | 'ALL')}
                className="appearance-none rounded-lg border border-outline bg-surface-container-lowest py-2 pl-3 pr-8 text-sm text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {INVOICE_TABS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />
            </div>
          </div>

          {/* Invoice table */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
            {invoiceLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <ReceiptText className="mb-3 h-12 w-12 text-outline-variant" />
                <p className="font-semibold text-on-surface">ไม่พบใบแจ้งหนี้</p>
                <p className="mt-1 text-sm text-on-surface-variant">สร้างรอบบิลและ Generate Invoice ก่อน</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-outline-variant">
                      {['เลขที่ใบแจ้งหนี้', 'ห้อง', 'ผู้เช่า', 'เดือน/ปี', 'ยอดรวม', 'สถานะ', 'ครบกำหนด', 'จัดการ'].map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-outline-variant/5 hover:bg-surface-container/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-primary">
                          {inv.invoiceNumber}
                        </td>
                        <td className="px-4 py-3 font-semibold text-on-surface">{inv.roomNo}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{inv.tenantName}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{inv.periodLabel}</td>
                        <td className="px-4 py-3 text-right font-semibold text-on-surface whitespace-nowrap">
                          ฿{formatBaht(inv.totalAmount)}
                        </td>
                        <td className="px-4 py-3">
                          <InvoiceStatusBadge status={inv.status} />
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap text-xs">
                          {inv.dueDate
                            ? new Date(inv.dueDate).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
                            : <span className="text-outline">—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {inv.status !== 'PAID' && (
                              <button
                                onClick={() => void handleSendInvoice(inv.id)}
                                className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container"
                              >
                                <Send className="h-3 w-3" />
                                ส่ง
                              </button>
                            )}
                            <Link href={`/admin/invoices/${inv.id}`} className="inline-flex items-center gap-1 rounded-lg border border-outline bg-surface-container-lowest px-3 py-1.5 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container">
                              ดู →
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

          {!invoiceLoading && (
            <p className="text-right text-xs text-on-surface-variant">
              แสดง {filteredInvoices.length} ใบแจ้งหนี้
            </p>
          )}
        </>
      )}
    </main>
  );
}
